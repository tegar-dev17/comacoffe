import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { WebhookService } from "../modules/payment/services/webhook.service.js";

export async function registerWebhookRoutes(app: FastifyInstance, env: Env) {
  const webhookService = new WebhookService(app.db, env);

  const webhookRateLimit = {
    rateLimit: {
      max: env.WEBHOOK_RATE_LIMIT_PER_MINUTE,
      timeWindow: "1 minute" as const,
    },
  };

  app.post("/api/v1/webhooks/midtrans/notification", { config: webhookRateLimit }, async (request, reply) => {
    try {
      const result = await webhookService.handleWebhook(
        "midtrans",
        request.headers as Record<string, string | string[] | undefined>,
        request.body,
      );
      if (!result.ok && result.reason === "invalid_signature") {
        return reply.status(401).send("Invalid signature");
      }
      return reply.status(200).send("OK");
    } catch (err) {
      request.log.error({ err }, "midtrans webhook failed");
      return reply.status(500).send("ERROR");
    }
  });

  app.post("/api/v1/webhooks/xendit/qris", { config: webhookRateLimit }, async (request, reply) => {
    try {
      const result = await webhookService.handleWebhook(
        "xendit",
        request.headers as Record<string, string | string[] | undefined>,
        request.body,
      );
      if (!result.ok && result.reason === "invalid_signature") {
        return reply.status(401).send({ error: "Invalid callback token" });
      }
      return reply.status(200).send({ received: true });
    } catch (err) {
      request.log.error({ err }, "xendit webhook failed");
      return reply.status(500).send({ error: "processing_failed" });
    }
  });
}
