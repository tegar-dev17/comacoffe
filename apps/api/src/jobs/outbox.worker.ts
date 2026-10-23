import { isNull, eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import * as schema from "../db/schema/index.js";

export async function processOutboxBatch(db: AppDatabase, limit = 20) {
  const events = await db
    .select()
    .from(schema.transactionalOutbox)
    .where(isNull(schema.transactionalOutbox.processedAt))
    .limit(limit);

  for (const event of events) {
    // POS notification hook — extend with WebSocket/SSE/push integration.
    await db
      .update(schema.transactionalOutbox)
      .set({ processedAt: new Date() })
      .where(eq(schema.transactionalOutbox.id, event.id));
  }
  return events.length;
}

export function startOutboxWorker(db: AppDatabase, intervalMs = 5000) {
  const timer = setInterval(() => {
    void processOutboxBatch(db).catch((err) => {
      console.error("outbox worker error", err);
    });
  }, intervalMs);
  return () => clearInterval(timer);
}
