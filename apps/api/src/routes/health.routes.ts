import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

export async function registerHealthRoutes(app: FastifyInstance, env: Env) {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async () => {
    const providerConfigured =
      env.PAYMENT_PROVIDER === "midtrans"
        ? Boolean(env.MIDTRANS_SERVER_KEY)
        : env.PAYMENT_PROVIDER === "xendit"
          ? Boolean(env.XENDIT_SECRET_KEY)
          : true;
    return {
      status: providerConfigured ? "ready" : "degraded",
      paymentEnv: env.PAYMENT_ENV,
      paymentProvider: env.PAYMENT_PROVIDER,
      providerConfigured,
    };
  });
}
