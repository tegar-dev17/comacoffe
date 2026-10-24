import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import type { AppDatabase } from "../../db/client.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type pg from "pg";
import {
  RESERVING_REFUND_STATUSES,
  sumReservedRefundAmountMinor,
  REFUND_EXCEEDS_REMAINING_MESSAGE,
} from "./refund-reservation.js";
import { PaymentService } from "./services/payment.service.js";
import {
  PaymentConflictError,
  PaymentValidationError,
} from "./services/payment.service.js";
import { RefundService } from "./services/refund.service.js";

describe("refund integrity and concurrency", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let admin: { userId: string; tenantId: string; role: string; outletId: null; email: string };
  let outletId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret-key-32chars";
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;

    const suffix = crypto.randomUUID().slice(0, 8);
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Refund Test", slug: `rf-${suffix}` })
      .returning();
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "O", code: `RF-${suffix}` })
      .returning();
    outletId = outlet!.id;
    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: `admin-rf-${suffix}@example.com`,
        displayName: "Admin",
        role: "admin",
      })
      .returning();

    admin = {
      userId: user!.id,
      tenantId: tenant!.id,
      role: "admin",
      outletId: null,
      email: user!.email,
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
        tenantId: admin.tenantId,
        outletId,
        orderNumber: `ORD-RF-${suffix}`,
        totalMinor,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    const env = loadEnv();
    const payments = new PaymentService(db, env);
    const created = await payments.createPayment(admin, {
      orderId: order!.id,
      paymentMethod: "cash",
      idempotencyKey: `pay-${suffix}`,
    });
    return (created as { id: string }).id;
  }

  it("processes a valid partial cash refund", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(20_000);

    const result = (await refunds.createRefund(admin, paymentId, {
      amountMinor: 8_000,
      reason: "Customer partial return",
      idempotencyKey: `valid-partial-${crypto.randomUUID()}`,
    })) as { status: string; amountMinor: number };

    expect(result.status).toBe("SUCCEEDED");
    expect(result.amountMinor).toBe(8_000);

    const payment = await db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    expect(payment?.status).toBe("PARTIALLY_REFUNDED");

    const reserved = await sumReservedRefundAmountMinor(db, paymentId);
    expect(reserved).toBe(8_000);
  });

  it("rejects a refund exceeding remaining refundable balance", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(10_000);

    await expect(
      refunds.createRefund(admin, paymentId, {
        amountMinor: 15_000,
        reason: "Too much",
        idempotencyKey: `over-${crypto.randomUUID()}`,
      }),
    ).rejects.toMatchObject({
      name: "PaymentConflictError",
      message: REFUND_EXCEEDS_REMAINING_MESSAGE,
    });

    const rows = await db.query.paymentRefunds.findMany({
      where: eq(schema.paymentRefunds.paymentId, paymentId),
    });
    expect(rows).toHaveLength(0);
  });

  it("returns the same response for repeated idempotency key", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(12_000);
    const key = `idem-refund-${crypto.randomUUID()}`;
    const payload = {
      amountMinor: 3_000,
      reason: "Duplicate key test",
      idempotencyKey: key,
    };

    const first = await refunds.createRefund(admin, paymentId, payload);
    const second = await refunds.createRefund(admin, paymentId, payload);
    expect(second).toEqual(first);

    const rows = await db.query.paymentRefunds.findMany({
      where: eq(schema.paymentRefunds.paymentId, paymentId),
    });
    expect(rows).toHaveLength(1);
  });

  it("prevents concurrent refunds from over-reserving the payment", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(10_000);

    const results = await Promise.allSettled([
      refunds.createRefund(admin, paymentId, {
        amountMinor: 7_000,
        reason: "Concurrent A",
        idempotencyKey: `race-a-${crypto.randomUUID()}`,
      }),
      refunds.createRefund(admin, paymentId, {
        amountMinor: 7_000,
        reason: "Concurrent B",
        idempotencyKey: `race-b-${crypto.randomUUID()}`,
      }),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PaymentConflictError);

    const reserved = await sumReservedRefundAmountMinor(db, paymentId);
    expect(reserved).toBeLessThanOrEqual(10_000);
    expect(reserved).toBe(7_000);

    const reservingRows = await db.query.paymentRefunds.findMany({
      where: and(
        eq(schema.paymentRefunds.paymentId, paymentId),
        inArray(schema.paymentRefunds.status, [...RESERVING_REFUND_STATUSES]),
      ),
    });
    expect(reservingRows).toHaveLength(1);
    expect(reservingRows[0]!.amountMinor).toBe(7_000);
  });

  it("allows a new refund after a prior refund failed", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(10_000);
    const failedId = crypto.randomUUID();

    await db.insert(schema.paymentRefunds).values({
      id: failedId,
      paymentId,
      tenantId: admin.tenantId,
      amountMinor: 4_000,
      currency: "IDR",
      reason: "Simulated provider failure",
      status: "FAILED",
      approvalStatus: "NOT_REQUIRED",
      idempotencyKey: `failed-${crypto.randomUUID()}`,
      requestedByUserId: admin.userId,
    });

    const reservedBefore = await sumReservedRefundAmountMinor(db, paymentId);
    expect(reservedBefore).toBe(0);

    const result = (await refunds.createRefund(admin, paymentId, {
      amountMinor: 4_000,
      reason: "Retry after failure",
      idempotencyKey: `retry-${crypto.randomUUID()}`,
    })) as { status: string };
    expect(result.status).toBe("SUCCEEDED");

    const reservedAfter = await sumReservedRefundAmountMinor(db, paymentId);
    expect(reservedAfter).toBe(4_000);
  });

  it("rejects non-positive refund amounts before reserving", async () => {
    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const paymentId = await createSucceededCashPayment(5_000);

    await expect(
      refunds.createRefund(admin, paymentId, {
        amountMinor: 0,
        reason: "Zero",
        idempotencyKey: `zero-${crypto.randomUUID()}`,
      }),
    ).rejects.toBeInstanceOf(PaymentValidationError);
  });
});
