import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type { AppDatabase } from "../../db/client.js";
import type pg from "pg";
import { PaymentService } from "./services/payment.service.js";
import { RefundService } from "./services/refund.service.js";

describe("extended tenant isolation", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let orderA: string;
  let orderB: string;
  let adminA: { userId: string; tenantId: string; role: string; outletId: null; email: string };
  let adminB: { userId: string; tenantId: string; role: string; outletId: null; email: string };
  let cashierA: { userId: string; tenantId: string; role: string; outletId: string; email: string };
  let outletA2: string;

  beforeAll(async () => {
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;
    const suffix = crypto.randomUUID().slice(0, 8);

    const [tA] = await db
      .insert(schema.tenants)
      .values({ name: "TA", slug: `ta-${suffix}` })
      .returning();
    const [tB] = await db
      .insert(schema.tenants)
      .values({ name: "TB", slug: `tb-${suffix}` })
      .returning();

    const [oA] = await db
      .insert(schema.outlets)
      .values({ tenantId: tA!.id, name: "A1", code: `A1-${suffix}` })
      .returning();
    const [oA2row] = await db
      .insert(schema.outlets)
      .values({ tenantId: tA!.id, name: "A2", code: `A2-${suffix}` })
      .returning();
    outletA2 = oA2row!.id;

    const [oB] = await db
      .insert(schema.outlets)
      .values({ tenantId: tB!.id, name: "B1", code: `B1-${suffix}` })
      .returning();

    const [uAdminA] = await db
      .insert(schema.users)
      .values({
        tenantId: tA!.id,
        email: `admin-a-${suffix}@example.com`,
        displayName: "Admin A",
        role: "admin",
      })
      .returning();
    const [uAdminB] = await db
      .insert(schema.users)
      .values({
        tenantId: tB!.id,
        email: `admin-b-${suffix}@example.com`,
        displayName: "Admin B",
        role: "admin",
      })
      .returning();
    const [uCashierA] = await db
      .insert(schema.users)
      .values({
        tenantId: tA!.id,
        email: `cashier-a-${suffix}@example.com`,
        displayName: "Cashier A",
        role: "cashier",
        outletId: oA!.id,
      })
      .returning();

    adminA = {
      userId: uAdminA!.id,
      tenantId: tA!.id,
      role: "admin",
      outletId: null,
      email: uAdminA!.email,
    };
    adminB = {
      userId: uAdminB!.id,
      tenantId: tB!.id,
      role: "admin",
      outletId: null,
      email: uAdminB!.email,
    };
    cashierA = {
      userId: uCashierA!.id,
      tenantId: tA!.id,
      role: "cashier",
      outletId: oA!.id,
      email: uCashierA!.email,
    };

    const [ordA] = await db
      .insert(schema.orders)
      .values({
        tenantId: tA!.id,
        outletId: oA!.id,
        orderNumber: `ORD-A-${suffix}`,
        totalMinor: 10000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    orderA = ordA!.id;

    const [ordB] = await db
      .insert(schema.orders)
      .values({
        tenantId: tB!.id,
        outletId: oB!.id,
        orderNumber: `ORD-B-${suffix}`,
        totalMinor: 20000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    orderB = ordB!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("tenant B cannot read tenant A order by id", async () => {
    const order = await db.query.orders.findFirst({
      where: and(eq(schema.orders.id, orderA), eq(schema.orders.tenantId, adminB.tenantId)),
    });
    expect(order).toBeUndefined();
  });

  it("tenant A cannot create payment for tenant B order", async () => {
    const env = loadEnv();
    const payments = new PaymentService(db, env);
    await expect(
      payments.createPayment(adminA, {
        orderId: orderB,
        paymentMethod: "cash",
        idempotencyKey: `cross-order-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow(/Order not found/);
  });

  it("tenant B cannot refund tenant A payment", async () => {
    const env = loadEnv();
    const payments = new PaymentService(db, env);
    const refunds = new RefundService(db, env);
    const created = await payments.createPayment(adminA, {
      orderId: orderA,
      paymentMethod: "cash",
      idempotencyKey: `refund-cross-${crypto.randomUUID()}`,
    });
    const paymentId = (created as { id: string }).id;
    await expect(
      refunds.createRefund(adminB, paymentId, {
        amountMinor: 1000,
        reason: "test cross tenant",
        idempotencyKey: `refund-key-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow(/not found/i);
  });

  it("cashier cannot access payment from another outlet", async () => {
    const env = loadEnv();
    const payments = new PaymentService(db, env);
    const [orderOtherOutlet] = await db
      .insert(schema.orders)
      .values({
        tenantId: adminA.tenantId,
        outletId: outletA2,
        orderNumber: `ORD-A2-${crypto.randomUUID().slice(0, 6)}`,
        totalMinor: 9000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    const created = await payments.createPayment(adminA, {
      orderId: orderOtherOutlet!.id,
      paymentMethod: "cash",
      idempotencyKey: `outlet-cross-${crypto.randomUUID()}`,
    });
    await expect(
      payments.getPayment(cashierA, (created as { id: string }).id),
    ).rejects.toThrow(/denied|not found/i);
  });
});
