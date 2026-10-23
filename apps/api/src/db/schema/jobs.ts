import { pgTable, text, timestamp, uuid, index } from "drizzle-orm/pg-core";

export const backgroundJobLeases = pgTable(
  "background_job_leases",
  {
    jobName: text("job_name").primaryKey(),
    lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
    lockedBy: text("locked_by").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("background_job_leases_locked_until_idx").on(t.lockedUntil)],
);

export const outboxDeadLetters = pgTable(
  "outbox_dead_letters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outboxId: uuid("outbox_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    errorMessage: text("error_message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("outbox_dead_letters_created_idx").on(t.createdAt)],
);
