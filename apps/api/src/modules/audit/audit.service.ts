import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";

type Db = NodePgDatabase<typeof schema>;

export async function writeAuditLog(
  db: Db,
  input: {
    tenantId: string;
    actorUserId?: string;
    action: string;
    resourceType: string;
    resourceId: string;
    metadata?: Record<string, unknown>;
  },
) {
  await db.insert(schema.auditLogs).values({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}
