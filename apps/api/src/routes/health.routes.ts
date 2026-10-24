import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Env } from "../config/env.js";

export async function registerHealthRoutes(app: FastifyInstance, env: Env) {
  app.get("/health", async () => ({ status: "ok" }));

  app.get("/ready", async (_request, reply) => {
    let databaseOk = false;
    try {
      await app.db.execute(sql`SELECT 1`);
      databaseOk = true;
    } catch {
      databaseOk = false;
    }

    const providerConfigured =
      env.PAYMENT_PROVIDER === "midtrans"
        ? Boolean(env.MIDTRANS_SERVER_KEY)
        : env.PAYMENT_PROVIDER === "xendit"
          ? Boolean(env.XENDIT_SECRET_KEY)
          : true;

    const status = !databaseOk ? "unavailable" : providerConfigured ? "ready" : "degraded";

    return reply.status(databaseOk ? 200 : 503).send({
      status,
      databaseOk,
      paymentEnv: env.PAYMENT_ENV,
      paymentProvider: env.PAYMENT_PROVIDER,
      providerConfigured,
    });
  });
}
