import { eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import type { AppDatabase } from "../../db/client.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type pg from "pg";
import { PaymentService } from "./services/payment.service.js";
import { WebhookService } from "./services/webhook.service.js";

describe("payment transitions and out-of-order webhooks", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let tenantId: string;
  let outletId: string;
  let orderId: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = "integration-test-secret-key-32chars";
    process.env.MIDTRANS_SERVER_KEY = "SB-Mid-server-test-key";
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;

    const suffix = crypto.randomUUID().slice(0, 8);
    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "Transition Test", slug: `tr-${suffix}` })
      .returning();
    tenantId = tenant!.id;
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId, name: "O", code: `O-${suffix}` })
      .returning();
    outletId = outlet!.id;
    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId,
        outletId,
        orderNumber: `ORD-TR-${suffix}`,
        totalMinor: 42000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();
    orderId = order!.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  function midtransSignature(body: {
    order_id: string;
    status_code: string;
    gross_amount: string;
  }, serverKey: string) {
    return createHash("sha512")
      .update(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
      .digest("hex");
  }

  it("does not downgrade SUCCEEDED when a stale PENDING webhook arrives later", async () => {
    const env = loadEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-test-key" });
    const webhookService = new WebhookService(db, env);
    const suffix = crypto.randomUUID().slice(0, 8);
    const providerReference = `ORD-STALE-${suffix}`;
    const transactionId = `tx-stale-${suffix}`;

    const [payment] = await db
      .insert(schema.payments)
      .values({
        tenantId,
        outletId,
        orderId,
        provider: "midtrans",
        providerPaymentId: transactionId,
        providerReference,
        idempotencyKey: `idem-stale-${suffix}`,
        paymentMethod: "qris",
        amountMinor: 42000,
        currency: "IDR",
        status: "PENDING",
      })
      .returning();

    const settlementBody = {
      order_id: providerReference,
      status_code: "200",
      gross_amount: "42000.00",
      transaction_status: "settlement",
      transaction_id: transactionId,
    };
    const settlementSig = midtransSignature(settlementBody, env.MIDTRANS_SERVER_KEY!);

    await webhookService.handleWebhook(
      "midtrans",
      {},
      { ...settlementBody, signature_key: settlementSig },
    );

    const pendingBody = {
      order_id: providerReference,
      status_code: "201",
      gross_amount: "42000.00",
      transaction_status: "pending",
      transaction_id: transactionId,
    };
    const pendingSig = midtransSignature(pendingBody, env.MIDTRANS_SERVER_KEY!);

    await webhookService.handleWebhook(
      "midtrans",
      {},
      { ...pendingBody, signature_key: pendingSig },
    );

    const updated = await db.query.payments.findFirst({
      where: eq(schema.payments.id, payment!.id),
    });
    expect(updated?.status).toBe("SUCCEEDED");

    const order = await db.query.orders.findFirst({ where: eq(schema.orders.id, orderId) });
    expect(order?.status).toBe("paid");
  });

  it("applyStatusTransition uses current DB status under stale in-memory payment", async () => {
    const env = loadEnv();
    const service = new PaymentService(db, env);
    const suffix = crypto.randomUUID().slice(0, 8);

    const [payment] = await db
      .insert(schema.payments)
      .values({
        tenantId,
        outletId,
        orderId,
        provider: "midtrans",
        providerReference: `REF-${suffix}`,
        providerPaymentId: `tx-${suffix}`,
        idempotencyKey: `idem-tr-${suffix}`,
        paymentMethod: "qris",
        amountMinor: 1000,
        currency: "IDR",
        status: "PENDING",
      })
      .returning();

    await service.applyStatusTransition(
      payment!,
      "SUCCEEDED",
      "test.settlement",
      "evt-1",
      {},
    );

    const staleSnapshot = { ...payment!, status: "PENDING" as const };
    const after = await service.applyStatusTransition(
      staleSnapshot,
      "FAILED",
      "test.stale-failed",
      "evt-2",
      {},
    );

    expect(after.status).toBe("SUCCEEDED");
  });

  it("ignores webhook when provider reference does not match stored payment", async () => {
    const env = loadEnv({ MIDTRANS_SERVER_KEY: "SB-Mid-server-test-key" });
    const webhookService = new WebhookService(db, env);
    const suffix = crypto.randomUUID().slice(0, 8);
    const providerReference = `ORD-OWN-${suffix}`;
    const transactionId = `tx-own-${suffix}`;

    const [payment] = await db
      .insert(schema.payments)
      .values({
        tenantId,
        outletId,
        orderId,
        provider: "midtrans",
        providerPaymentId: transactionId,
        providerReference,
        idempotencyKey: `idem-own-${suffix}`,
        paymentMethod: "qris",
        amountMinor: 5000,
        currency: "IDR",
        status: "PENDING",
      })
      .returning();

    const body = {
      order_id: `${providerReference}-WRONG`,
      status_code: "200",
      gross_amount: "5000.00",
      transaction_status: "settlement",
      transaction_id: transactionId,
    };
    const signature = midtransSignature(body, env.MIDTRANS_SERVER_KEY!);

    const result = await webhookService.handleWebhook(
      "midtrans",
      {},
      { ...body, signature_key: signature },
    );
    expect(result.ignored).toBe(true);

    const updated = await db.query.payments.findFirst({
      where: eq(schema.payments.id, payment!.id),
    });
    expect(updated?.status).toBe("PENDING");
  });
});
