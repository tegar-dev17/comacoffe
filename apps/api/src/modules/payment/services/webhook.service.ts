import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";
import { createProviderAdapter } from "../providers/factory.js";
import type { PaymentProvider } from "../types.js";
import { PaymentService } from "./payment.service.js";

type Db = NodePgDatabase<typeof schema>;

export class WebhookService {
  private paymentService: PaymentService;

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {
    this.paymentService = new PaymentService(db, env);
  }

  async handleWebhook(
    provider: PaymentProvider,
    headers: Record<string, string | string[] | undefined>,
    body: unknown,
  ) {
    const adapter = createProviderAdapter(this.env, provider);
    if (!adapter) {
      throw new Error("Invalid webhook provider");
    }

    const signatureValid = adapter.verifyWebhook(headers, body);
    const parsed = adapter.parseWebhookEvent(body);

    const insertResult = await this.db
      .insert(schema.paymentWebhookEvents)
      .values({
        provider,
        providerEventId: parsed.providerEventId,
        rawHeadersJson: sanitizeHeaders(headers),
        rawBodyJson: body as Record<string, unknown>,
        signatureValid,
        processingStatus: signatureValid ? "RECEIVED" : "INVALID",
        processingError: signatureValid ? null : "Invalid signature or token",
      })
      .onConflictDoNothing()
      .returning();

    if (!signatureValid) {
      return { ok: false, reason: "invalid_signature" };
    }

    if (insertResult.length === 0) {
      return { ok: true, duplicate: true };
    }

    const webhookRow = insertResult[0]!;

    try {
      await this.db
        .update(schema.paymentWebhookEvents)
        .set({ processingStatus: "PROCESSING" })
        .where(eq(schema.paymentWebhookEvents.id, webhookRow.id));

      const payment =
        (await this.paymentService.getPaymentByProviderReference(
          parsed.providerReference ?? "",
        )) ??
        (parsed.providerPaymentId
          ? await this.db.query.payments.findFirst({
              where: eq(schema.payments.providerPaymentId, parsed.providerPaymentId),
            })
          : null);

      if (!payment) {
        await this.db
          .update(schema.paymentWebhookEvents)
          .set({
            processingStatus: "FAILED",
            processingError: "Payment not found",
            processedAt: new Date(),
          })
          .where(eq(schema.paymentWebhookEvents.id, webhookRow.id));
        return { ok: true, ignored: true };
      }

      if (
        parsed.amountMinor !== undefined &&
        parsed.currency &&
        (parsed.amountMinor !== payment.amountMinor || parsed.currency !== payment.currency)
      ) {
        await this.db.insert(schema.paymentReconciliations).values({
          paymentId: payment.id,
          status: "MISMATCH",
          internalStatus: payment.status,
          providerStatus: String(parsed.rawPayload.transaction_status ?? parsed.rawPayload.status),
          amountMinorInternal: payment.amountMinor,
          amountMinorProvider: parsed.amountMinor,
          notes: "Webhook amount/currency mismatch",
        });
        await this.db
          .update(schema.paymentWebhookEvents)
          .set({
            paymentId: payment.id,
            processingStatus: "FAILED",
            processingError: "Amount mismatch",
            processedAt: new Date(),
          })
          .where(eq(schema.paymentWebhookEvents.id, webhookRow.id));
        return { ok: true, mismatch: true };
      }

      await this.paymentService.applyStatusTransition(
        payment,
        parsed.normalizedStatus,
        `webhook.${provider}`,
        parsed.providerEventId,
        parsed.rawPayload,
      );

      await this.db
        .update(schema.paymentWebhookEvents)
        .set({
          paymentId: payment.id,
          processingStatus: "PROCESSED",
          processedAt: new Date(),
        })
        .where(eq(schema.paymentWebhookEvents.id, webhookRow.id));

      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Processing failed";
      await this.db
        .update(schema.paymentWebhookEvents)
        .set({
          processingStatus: "FAILED",
          processingError: message,
          processedAt: new Date(),
        })
        .where(eq(schema.paymentWebhookEvents.id, webhookRow.id));
      throw err;
    }
  }
}

function sanitizeHeaders(headers: Record<string, string | string[] | undefined>) {
  const copy: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase().includes("authorization") || k.toLowerCase().includes("token")) {
      copy[k] = "[REDACTED]";
    } else if (v !== undefined) {
      copy[k] = v;
    }
  }
  return copy;
}
