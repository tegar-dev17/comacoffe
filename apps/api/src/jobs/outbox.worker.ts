import type { AppDatabase } from "../db/client.js";
import type { Env } from "../config/env.js";
import { processOutboxBatch } from "../modules/payment/services/outbox.service.js";

export function startOutboxWorker(db: AppDatabase, env: Env, intervalMs?: number) {
  if (env.NODE_ENV === "test") {
    return () => undefined;
  }
  const every = intervalMs ?? env.OUTBOX_INTERVAL_MS;
  const timer = setInterval(() => {
    void processOutboxBatch(db, env).catch((err) => {
      console.error("outbox worker error", err);
    });
  }, every);
  return () => clearInterval(timer);
}
