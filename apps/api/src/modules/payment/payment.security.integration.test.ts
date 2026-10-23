import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type { AppDatabase } from "../../db/client.js";
import type pg from "pg";
import { PaymentService } from "./services/payment.service.js";
import { WebhookService } from "./services/webhook.service.js";
import { createHash } from "node:crypto";

describe("payment security integration", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let tenantA: string;
  let tenantB: string;
  let outletA: string;
  let orderA: string;
  let adminA: { userId: string; tenantId: string; role: string; outletId: null; email: string };
  let cashierB: { userId: string; tenantId: string; role: string; outletId: string; email: string };

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret-key-32chars";
    process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test-key";
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;

    const suffix = crypto.randomUUID().slice(0, 8);
    const [tA] = await db
      .insert(schema.tenants)
      .values({ name: "Tenant A", slug: `tenant-a-${suffix}` })
      .returning();
    const [tB] = await db
      .insert(schema.tenants)
      .values({ name: "Tenant B", slug: `tenant-b-${suffix}` })
      .returning();
    tenantA = tA!.id;
    tenantB = tB!.id;

    const [oA] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenantA, name: "Outlet A", code: "A1" })
      .returning();
    outletA = oA!.id;

    const [uAdmin] = await db
      .insert(schema.users)
      .values({
        tenantId: tenantA,
        email: "admin-a@test.local",
        displayName: "Admin A",
        role: "admin",
      })
      .returning();

    const [oB] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenantB, name: "Outlet B", code: "B1" })
      .returning();

    const [uCashierB] = await db
      .insert(schema.users)
      .values({
        tenantId: tenantB,
        email: "cashier-b@test.local",
        displayName: "Cashier B",
        role: "cashier",
        outletId: oB!.id,
      })
      .returning();

    adminA = {
      userId: uAdmin!.id,
      tenantId: tenantA,
      role: "admin",
      outletId: null,
      email: uAdmin!.email,
    };
    cashierB = {
      userId: uCashierB!.id,
      tenantId: tenantB,
      role: "cashier",
      outletId: oB!.id,
      email: uCashierB!.email,
    };

    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderNumber: "ORD-SEC-1",
        totalMinor: 25000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    orderA = order!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("tenant B cannot read tenant A payment", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const created = await service.createPayment(adminA, {
      orderId: orderA,
      paymentMethod: "cash",
      idempotencyKey: "idem-cash-1",
    });
    const paymentId = (created as { id: string }).id;

    await expect(service.getPayment(cashierB, paymentId)).rejects.toThrow(/not found|denied/i);
  });

  it("cash payment marks order paid using server-side amount", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const [order2] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderNumber: "ORD-SEC-2",
        totalMinor: 33000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();

    await service.createPayment(adminA, {
      orderId: order2!.id,
      paymentMethod: "cash",
      idempotencyKey: "idem-cash-2",
    });

    const updated = await db.query.orders.findFirst({
      where: eq(schema.orders.id, order2!.id),
    });
    expect(updated?.status).toBe("paid");
  });

  it("rejects duplicate idempotency key with different payload", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const [order3] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderNumber: "ORD-SEC-3",
        totalMinor: 12000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();

    await service.createPayment(adminA, {
      orderId: order3!.id,
      paymentMethod: "cash",
      idempotencyKey: "idem-conflict",
    });

    const [order4] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderNumber: "ORD-SEC-4",
        totalMinor: 12000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();

    await expect(
      service.createPayment(adminA, {
        orderId: order4!.id,
        paymentMethod: "cash",
        idempotencyKey: "idem-conflict",
      }),
    ).rejects.toThrow(/Idempotency key reused/);
  });

  it("invalid webhook signature does not mark payment succeeded", async () => {
    const env = loadEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-test-key" });
    const paymentService = new PaymentService(db, env);
    const webhookService = new WebhookService(db, env);

    const [order5] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderNumber: "ORD-SEC-5",
        totalMinor: 50000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();

    const payment = await db.query.payments.findFirst({
      where: and(eq(schema.payments.orderId, order5!.id)),
    });

    let paymentId = payment?.id;
    if (!paymentId) {
      const created = await paymentService.createPayment(adminA, {
        orderId: order5!.id,
        paymentMethod: "cash",
        idempotencyKey: "idem-wh-1",
      });
      paymentId = (created as { id: string }).id;
      await db
        .update(schema.payments)
        .set({
          provider: "midtrans",
          status: "PENDING",
          providerReference: "ORD-WH-5",
          providerPaymentId: "tx-wh-5",
        })
        .where(eq(schema.payments.id, paymentId));
    }

    const body = {
      order_id: "ORD-WH-5",
      status_code: "200",
      gross_amount: "50000.00",
      transaction_status: "settlement",
      transaction_id: "tx-wh-5",
      signature_key: "bad-signature",
    };

    const result = await webhookService.handleWebhook("midtrans", {}, body);
    expect(result.ok).toBe(false);

    const refreshed = await db.query.payments.findFirst({
      where: eq(schema.payments.providerReference, "ORD-WH-5"),
    });
    expect(refreshed?.status).not.toBe("SUCCEEDED");
  });

  it("valid webhook updates payment once for duplicate events", async () => {
    const env = loadEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-test-key" });
    const webhookService = new WebhookService(db, env);

    const [payment] = await db
      .insert(schema.payments)
      .values({
        tenantId: tenantA,
        outletId: outletA,
        orderId: orderA,
        provider: "midtrans",
        providerPaymentId: "tx-dup-1",
        providerReference: "ORD-DUP-1",
        idempotencyKey: "idem-dup-pay",
        paymentMethod: "qris",
        amountMinor: 10000,
        currency: "IDR",
        status: "PENDING",
      })
      .returning();

    const body = {
      order_id: "ORD-DUP-1",
      status_code: "200",
      gross_amount: "10000.00",
      transaction_status: "settlement",
      transaction_id: "tx-dup-1",
    };
    const signature = createHash("sha512")
      .update(`${body.order_id}${body.status_code}${body.gross_amount}${env.MIDTRANS_SERVER_KEY}`)
      .digest("hex");

    await webhookService.handleWebhook("midtrans", {}, { ...body, signature_key: signature });
    await webhookService.handleWebhook("midtrans", {}, { ...body, signature_key: signature });

    const events = await db
      .select()
      .from(schema.paymentWebhookEvents)
      .where(eq(schema.paymentWebhookEvents.providerEventId, "tx-dup-1:settlement:200"));

    expect(events.length).toBe(1);

    const updated = await db.query.payments.findFirst({
      where: eq(schema.payments.id, payment!.id),
    });
    expect(updated?.status).toBe("SUCCEEDED");
  });
});
