import { vi } from "vitest";

vi.mock("./providers/factory.js", () => ({
  createProviderAdapter: () => ({
    capabilities: () => ({
      qris: true,
      cancel: true,
      refund: true,
      partialRefund: true,
      inquiry: true,
    }),
    refundPayment: vi.fn().mockRejectedValue(new Error("provider unavailable")),
  }),
}));

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import type { AppDatabase } from "../../db/client.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type pg from "pg";
import { sumReservedRefundAmountMinor } from "./refund-reservation.js";
import { RefundService } from "./services/refund.service.js";

describe("refund approval provider execution failure", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let tenantId: string;
  let outletId: string;
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
      .values({ name: "Provider Fail", slug: `pf-${suffix}` })
      .returning();
    tenantId = tenant!.id;
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId, name: "O", code: `PF-${suffix}` })
      .returning();
    outletId = outlet!.id;

    const [supervisorUser] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: `sup-pf-${suffix}@example.com`,
        role: "supervisor",
        displayName: "S",
      })
      .returning();
    const [adminUser] = await db
      .insert(schema.users)
      .values({
        tenantId,
        email: `admin-pf-${suffix}@example.com`,
        role: "admin",
        displayName: "A",
      })
      .returning();

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

  it("marks refund FAILED when provider call fails after approval claim", async () => {
    const suffix = crypto.randomUUID().slice(0, 8);
    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId,
        outletId,
        orderNumber: `ORD-PF-${suffix}`,
        totalMinor: 1_000_000,
        currency: "IDR",
        status: "paid",
      })
      .returning();

    const [payment] = await db
      .insert(schema.payments)
      .values({
        tenantId,
        outletId,
        orderId: order!.id,
        provider: "midtrans",
        providerReference: `REF-PF-${suffix}`,
        providerPaymentId: `tx-pf-${suffix}`,
        idempotencyKey: `idem-pf-${suffix}`,
        paymentMethod: "qris",
        amountMinor: 1_000_000,
        currency: "IDR",
        status: "SUCCEEDED",
      })
      .returning();

    const env = loadEnv();
    const refunds = new RefundService(db, env);
    const pending = (await refunds.createRefund(supervisor, payment!.id, {
      amountMinor: 600_000,
      reason: "Provider will fail",
      idempotencyKey: `pf-${suffix}`,
    })) as { id: string };

    await expect(refunds.approveRefund(admin, payment!.id, pending.id)).rejects.toThrow(
      /provider unavailable/,
    );

    const row = await db.query.paymentRefunds.findFirst({
      where: eq(schema.paymentRefunds.id, pending.id),
    });
    expect(row?.status).toBe("FAILED");
    expect(row?.approvalStatus).toBe("APPROVED");

    const paymentRow = await db.query.payments.findFirst({
      where: eq(schema.payments.id, payment!.id),
    });
    expect(paymentRow?.status).toBe("SUCCEEDED");

    const reserved = await sumReservedRefundAmountMinor(db, payment!.id);
    expect(reserved).toBe(0);
  });
});
