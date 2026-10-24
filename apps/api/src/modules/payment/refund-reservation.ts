import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";

/** Refund rows that count against the payment's remaining refundable balance. */
export const RESERVING_REFUND_STATUSES = [
  "SUCCEEDED",
  "PENDING",
  "PENDING_PROVIDER",
  "PENDING_APPROVAL",
] as const;

export type Db = NodePgDatabase<typeof schema>;

export async function sumSucceededRefundAmountMinor(
  db: Db,
  paymentId: string,
): Promise<number> {
  const rows = await db
    .select({
      succeeded: sql<number>`coalesce(sum(${schema.paymentRefunds.amountMinor}), 0)::int`,
    })
    .from(schema.paymentRefunds)
    .where(
      and(
        eq(schema.paymentRefunds.paymentId, paymentId),
        eq(schema.paymentRefunds.status, "SUCCEEDED"),
      ),
    );
  return rows[0]?.succeeded ?? 0;
}

export async function sumReservedRefundAmountMinor(
  db: Db,
  paymentId: string,
): Promise<number> {
  const rows = await db
    .select({
      reserved: sql<number>`coalesce(sum(${schema.paymentRefunds.amountMinor}), 0)::int`,
    })
    .from(schema.paymentRefunds)
    .where(
      and(
        eq(schema.paymentRefunds.paymentId, paymentId),
        inArray(schema.paymentRefunds.status, [...RESERVING_REFUND_STATUSES]),
      ),
    );
  return rows[0]?.reserved ?? 0;
}

export const REFUND_EXCEEDS_REMAINING_MESSAGE =
  "Refund amount exceeds remaining refundable balance";

export const REFUND_APPROVAL_ALREADY_PROCESSED_MESSAGE =
  "Refund approval already processed";
