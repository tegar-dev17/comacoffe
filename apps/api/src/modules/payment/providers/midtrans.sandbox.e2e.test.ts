import { describe, expect, it } from "vitest";
import { loadEnv } from "../../../config/env.js";
import { PaymentService } from "../services/payment.service.js";
import { WebhookService } from "../services/webhook.service.js";
import { setupIntegrationDb } from "../../../test/setup.integration.js";
import { createHash } from "node:crypto";
import * as schema from "../../../db/schema/index.js";
import { eq } from "drizzle-orm";

const e2eEnabled = process.env.MIDTRANS_E2E === "1" && Boolean(process.env.MIDTRANS_SERVER_KEY);

describe.runIf(e2eEnabled)("Midtrans sandbox E2E", () => {
  it("creates QRIS payment and applies signed webhook", async () => {
    const env = loadEnv();
    const { db, pool } = await setupIntegrationDb();
    const suffix = crypto.randomUUID().slice(0, 8);

    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "E2E", slug: `e2e-${suffix}` })
      .returning();
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "E2E", code: `E2E-${suffix}` })
      .returning();
    const [admin] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: `e2e-${suffix}@example.com`,
        displayName: "E2E",
        role: "admin",
      })
      .returning();
    const [order] = await db
      .insert(schema.orders)
      .values({
        tenantId: tenant!.id,
        outletId: outlet!.id,
        orderNumber: `E2E-${suffix}`,
        totalMinor: 10000,
        currency: "IDR",
        status: "pending_payment",
      })
      .returning();

    const auth = {
      userId: admin!.id,
      tenantId: tenant!.id,
      role: "admin",
      outletId: null,
      email: admin!.email,
    };

    const payments = new PaymentService(db, env);
    const created = await payments.createPayment(auth, {
      orderId: order!.id,
      paymentMethod: "qris",
      idempotencyKey: `e2e-${suffix}`,
      provider: "midtrans",
    });

    expect((created as { status: string }).status).toBe("PENDING");
    const paymentId = (created as { id: string }).id;
    const payment = await db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    expect(payment?.providerReference).toBeTruthy();

    const body = {
      order_id: payment!.providerReference,
      status_code: "200",
      gross_amount: "10000.00",
      transaction_status: "settlement",
      transaction_id: payment!.providerPaymentId ?? "e2e-tx",
    };
    const signature = createHash("sha512")
      .update(`${body.order_id}${body.status_code}${body.gross_amount}${env.MIDTRANS_SERVER_KEY}`)
      .digest("hex");

    const webhooks = new WebhookService(db, env);
    await webhooks.handleWebhook("midtrans", {}, { ...body, signature_key: signature });

    const updated = await db.query.payments.findFirst({
      where: eq(schema.payments.id, paymentId),
    });
    expect(updated?.status).toBe("SUCCEEDED");

    await pool.end();
  });
});
