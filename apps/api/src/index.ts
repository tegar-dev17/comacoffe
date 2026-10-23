import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import { loadEnv, validatePaymentProviderConfig } from "./config/env.js";
import { createDb, createDbPool } from "./db/client.js";
import dbPlugin from "./plugins/db.plugin.js";
import authPlugin from "./plugins/auth.plugin.js";
import { registerHealthRoutes } from "./routes/health.routes.js";
import { registerPaymentRoutes } from "./routes/payments.routes.js";
import { registerWebhookRoutes } from "./routes/webhooks.routes.js";
import { registerOrderRoutes } from "./routes/orders.routes.js";
import { registerReconciliationRoutes } from "./routes/reconciliation.routes.js";
import { registerDevRoutes } from "./routes/dev.routes.js";
import { startOutboxWorker } from "./jobs/outbox.worker.js";

async function main() {
  const env = loadEnv();
  validatePaymentProviderConfig(env);

  const pool = createDbPool(env.DATABASE_URL);
  const db = createDb(pool);

  const app = Fastify({
    logger: { level: env.LOG_LEVEL },
    bodyLimit: 256 * 1024,
    requestIdHeader: "x-request-id",
    genReqId: (req) =>
      (req.headers["x-request-id"] as string | undefined) ?? crypto.randomUUID(),
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(rateLimit, { global: false });
  await app.register(dbPlugin, { db });
  await app.register(authPlugin, { jwtSecret: env.JWT_SECRET });

  await registerHealthRoutes(app, env);
  await registerPaymentRoutes(app, env);
  await registerWebhookRoutes(app, env);
  await registerOrderRoutes(app);
  await registerReconciliationRoutes(app, env);
  await registerDevRoutes(app);

  const stopOutbox = startOutboxWorker(db);

  const shutdown = async () => {
    stopOutbox();
    await app.close();
    await pool.end();
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());

  await app.listen({ port: env.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
