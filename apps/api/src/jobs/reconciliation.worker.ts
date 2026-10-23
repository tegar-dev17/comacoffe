import type { AppDatabase } from "../db/client.js";
import type { Env } from "../config/env.js";
import { acquireJobLease } from "../modules/payment/services/outbox.service.js";
import { ReconciliationService } from "../modules/payment/services/reconciliation.service.js";
import { v4 as uuidv4 } from "uuid";

const JOB_NAME = "payment_reconciliation";

export async function runReconciliationTick(db: AppDatabase, env: Env) {
  const holder = `worker-${uuidv4().slice(0, 8)}`;
  const leased = await acquireJobLease(db, JOB_NAME, holder, env.RECONCILIATION_INTERVAL_MS - 1000);
  if (!leased) return { skipped: true };

  const service = new ReconciliationService(db, env);
  return service.runScheduledBatch();
}

export function startReconciliationScheduler(db: AppDatabase, env: Env) {
  if (env.NODE_ENV === "test") {
    return () => undefined;
  }
  const timer = setInterval(() => {
    void runReconciliationTick(db, env).catch((err) => {
      console.error("reconciliation worker error", err);
    });
  }, env.RECONCILIATION_INTERVAL_MS);
  return () => clearInterval(timer);
}
