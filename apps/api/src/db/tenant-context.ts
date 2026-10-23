import type pg from "pg";
import { sql } from "drizzle-orm";
import type { AppDatabase } from "./client.js";

/** Sets tenant context on a dedicated connection — required when RLS policies are enabled. */
export async function withTenantDbContext<T>(
  pool: pg.Pool,
  db: AppDatabase,
  tenantId: string | null,
  bypass: boolean,
  fn: (db: AppDatabase) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (bypass) {
      await client.query(`SELECT set_config('app.bypass_rls', 'on', true)`);
    } else if (tenantId) {
      await client.query(`SELECT set_config('app.tenant_id', $1, true)`, [tenantId]);
    }
    const result = await fn(db);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function setBypassRls(db: AppDatabase) {
  await db.execute(sql`SELECT set_config('app.bypass_rls', 'on', true)`);
}
