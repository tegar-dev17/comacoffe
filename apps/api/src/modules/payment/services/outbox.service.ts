import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type { Env } from "../../../config/env.js";
import * as schema from "../../../db/schema/index.js";

type Db = NodePgDatabase<typeof schema>;

export async function enqueueOutboxEvent(
  db: Db,
  event: {
    tenantId?: string;
    aggregateType: string;
    aggregateId: string;
    eventType: string;
    payload: Record<string, unknown>;
    dedupeKey?: string;
  },
) {
  if (event.dedupeKey) {
    await db
      .insert(schema.transactionalOutbox)
      .values({
        tenantId: event.tenantId,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        eventType: event.eventType,
        dedupeKey: event.dedupeKey,
        payloadJson: event.payload,
      })
      .onConflictDoNothing();
    return;
  }

  await db.insert(schema.transactionalOutbox).values({
    tenantId: event.tenantId,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    payloadJson: event.payload,
  });
}

export async function processOutboxBatch(db: Db, env: Env, limit = 20) {
  const now = new Date();
  const events = await db
    .select()
    .from(schema.transactionalOutbox)
    .where(
      and(
        isNull(schema.transactionalOutbox.processedAt),
        or(
          isNull(schema.transactionalOutbox.nextRetryAt),
          lte(schema.transactionalOutbox.nextRetryAt, now),
        ),
      ),
    )
    .orderBy(schema.transactionalOutbox.createdAt)
    .limit(limit);

  for (const event of events) {
    try {
      // POS notification hook — extend with WebSocket/SSE/push integration.
      await db
        .update(schema.transactionalOutbox)
        .set({ processedAt: new Date(), lastError: null })
        .where(eq(schema.transactionalOutbox.id, event.id));
    } catch (err) {
      const attempts = (event.attempts ?? 0) + 1;
      const message = err instanceof Error ? err.message : "Outbox processing failed";
      if (attempts >= env.OUTBOX_MAX_ATTEMPTS) {
        await db.insert(schema.outboxDeadLetters).values({
          outboxId: event.id,
          eventType: event.eventType,
          payloadJson: JSON.stringify(event.payloadJson),
          errorMessage: message,
        });
        await db
          .update(schema.transactionalOutbox)
          .set({ processedAt: new Date(), lastError: message, attempts })
          .where(eq(schema.transactionalOutbox.id, event.id));
      } else {
        const delayMs = Math.min(60_000, 500 * 2 ** attempts + Math.floor(Math.random() * 250));
        await db
          .update(schema.transactionalOutbox)
          .set({
            attempts,
            lastError: message,
            nextRetryAt: new Date(Date.now() + delayMs),
          })
          .where(eq(schema.transactionalOutbox.id, event.id));
      }
    }
  }
  return events.length;
}

export async function acquireJobLease(
  db: Db,
  jobName: string,
  holderId: string,
  leaseMs: number,
): Promise<boolean> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + leaseMs);
  const result = await db.execute(sql`
    INSERT INTO background_job_leases (job_name, locked_until, locked_by, updated_at)
    VALUES (${jobName}, ${lockedUntil}, ${holderId}, ${now})
    ON CONFLICT (job_name) DO UPDATE
      SET locked_until = EXCLUDED.locked_until,
          locked_by = EXCLUDED.locked_by,
          updated_at = EXCLUDED.updated_at
      WHERE background_job_leases.locked_until < ${now}
         OR background_job_leases.locked_by = ${holderId}
    RETURNING job_name
  `);
  return (result.rowCount ?? 0) > 0;
}
