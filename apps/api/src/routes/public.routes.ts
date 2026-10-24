import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";
import { resolvePosPaymentCapabilities } from "../modules/payment/payment-capabilities.js";

/** Non-sensitive deployment hints for operators (no secrets). */
export async function registerPublicRoutes(app: FastifyInstance, env: Env) {
  app.get("/api/v1/public/info", async () => {
    const caps = resolvePosPaymentCapabilities(env);
    const apiBase = env.API_BASE_URL.replace(/\/$/, "");
    return {
      data: {
        paymentProvider: env.PAYMENT_PROVIDER,
        paymentEnv: env.PAYMENT_ENV,
        midtransEnvironment: caps.midtransEnvironment,
        qrisAvailable: caps.qris,
        qrisDevMock: caps.qrisDevMock,
        midtransProductionReady: caps.midtransProductionReady,
        webhookPath: "/api/v1/webhooks/midtrans/notification",
        suggestedMidtransNotificationUrl: `${apiBase}/api/v1/webhooks/midtrans/notification`,
      },
    };
  });
}
