import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import type { AppDatabase } from "../../db/client.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type pg from "pg";
import {
  REFUND_EXCEEDS_REMAINING_MESSAGE,
  sumReservedRefundAmountMinor,
} from "./refund-reservation.js";
import { PaymentService } from "./services/payment.service.js";
import {
  PaymentConflictError,
  PaymentForbiddenError,
  PaymentValidationError,
} from "./services/payment.service.js";
import { RefundService } from "./services/refund.service.js";

describe("refund approval safety", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let tenantId: string;
  let outletId: string;
  let cashier: { userId: string; tenantId: string; role: string; outletId: string; email: string };
  let supervisor: {
    userId: string;
    tenantId: string;
    role: string;
    outletId: null;
    email: string;
  };
  let admin: { userId: string; tenantId: string; role: string; outletId: null; email: string };

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret-key-32chars";
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;

    const suffix = crypto.randomUUID().slice(0, 8);
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Approval Test", slug: `ap-${suffix}` })
      .returning();
    tenantId = tenant!.id;
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId, name: "O", code: `AP-${suffix}` })
      .returning();
    outletId = outlet!.id;

    const [cashierUser] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: `cashier-${suffix}@example.com`,
        displayName: "Cashier",
        role: "cashier",
        outletId,
      })
      .returning();
    const [supervisorUser] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: `supervisor-${suffix}@example.com`,
        displayName: "Supervisor",
        role: "supervisor",
      })
      .returning();
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: `admin-${suffix}@example.com`,
        displayName: "Admin",
        role: "admin",
      })
      .returning();

    cashier = {
      userId: cashierUser!.id,
      tenantId,
      role: "cashier",
      outletId,
      email: cashierUser!.email,
    };
    supervisor = {
      userId: supervisorUser!.id,
      tenantId,
      role: "supervisor",
      outletId: null,
      email: supervisorUser!.email,
    };
    admin = {
      userId: adminUser!.id,
      tenantId,
      role: "admin",
      outletId: null,
      email: adminUser!.email,
    };
  });

  afterAll(async () => {
    await pool.end();
  });

  async function createSucceededCashPayment(totalMinor: number): Promise<string> {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId,
        outletId,
        orderNumber: `ORD-AP-${suffix}`,
        totalMinor,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    const env = loadEnv();
    const payments = new PaymentService(db, env);
    const created = await payments.createPayment(
      { ...supervisor, role: "admin" },
      {
        orderId: order!.id,
        paymentMethod: "cash",
        idempotencyKey: `pay-ap-${suffix}`,
      },
    );
    return (created as { id: string }).id;
  }

  /** Amount above REFUND_APPROVAL_THRESHOLD_MINOR forces PENDING_APPROVAL for non-cashier roles. */
  async function pendingApprovalRefund(paymentId: string): Promise<string> {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const amountMinor = 600_000;
    const created = (await refunds.createRefund(supervisor, paymentId, {
      amountMinor,
      reason: "Needs supervisor approval",
      idempotencyKey: `pending-${crypto.randomUUID()}`,
    })) as { id: string; status: string };
    expect(created.status).toBe("PENDING_APPROVAL");
    return created.id;
  }

  it("approves a pending cash refund and completes execution", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);
    const refundId = await pendingApprovalRefund(paymentId);

    const result = (await refunds.approveRefund(admin, paymentId, refundId)) as {
      status: string;
      approvalStatus: string;
    };

    expect(result.status).toBe("SUCCEEDED");
    expect(result.approvalStatus).toBe("APPROVED");

    const payment = await db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    expect(payment?.status).toBe("PARTIALLY_REFUNDED");

    const refundRow = await db.query.paymentRefunds.findFirst({
      where: eq(schema.paymentRefunds.id, refundId),
    });
    expect(refundRow?.amountMinor).toBe(600_000);
  });

  it("rejects approval from cashier role", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);
    const refundId = await pendingApprovalRefund(paymentId);

    await expect(refunds.approveRefund(cashier, paymentId, refundId)).rejects.toBeInstanceOf(
      PaymentForbiddenError,
    );
  });

  it("rejects approval when requester and approver are the same user", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);
    const refundId = await pendingApprovalRefund(paymentId);

    await db
      .update(schema.paymentRefunds)
      .set({ requestedByUserId: supervisor.userId })
      .where(eq(schema.paymentRefunds.id, refundId));

    await expect(refunds.approveRefund(supervisor, paymentId, refundId)).rejects.toMatchObject({
      name: "PaymentForbiddenError",
    });
  });

  it("rejects repeated approval after execution started", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);
    const refundId = await pendingApprovalRefund(paymentId);

    await refunds.approveRefund(admin, paymentId, refundId);

    await expect(refunds.approveRefund(admin, paymentId, refundId)).rejects.toMatchObject({
      name: "PaymentValidationError",
      message: "Refund is not awaiting approval",
    });
  });

  it("allows only one concurrent approval to claim the refund", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);
    const refundId = await pendingApprovalRefund(paymentId);

    const results = await Promise.allSettled([
      refunds.approveRefund(admin, paymentId, refundId),
      refunds.approveRefund(admin, paymentId, refundId),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const err = (rejected[0] as PromiseRejectedResult).reason;
    expect(
      err instanceof PaymentConflictError || err instanceof PaymentValidationError,
    ).toBe(true);

    const row = await db.query.paymentRefunds.findFirst({
      where: eq(schema.paymentRefunds.id, refundId),
    });
    expect(row?.status).toBe("SUCCEEDED");
    expect(row?.approvalStatus).toBe("APPROVED");
  });

  it("prevents multiple pending approvals from exceeding payment total", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(1_000_000);

    await pendingApprovalRefund(paymentId);

    await expect(
      refunds.createRefund(supervisor, paymentId, {
        amountMinor: 500_000,
        reason: "Second pending",
        idempotencyKey: `second-pending-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      name: "PaymentConflictError",
      message: REFUND_EXCEEDS_REMAINING_MESSAGE,
    });

    const reserved = await sumReservedRefundAmountMinor(db, paymentId);
    expect(reserved).toBe(600_000);
  });
});
