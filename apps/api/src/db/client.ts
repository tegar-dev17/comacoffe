import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema/index.js";

export function createDbPool(databaseUrl: string) {
  return new pg.Pool({ connectionString: databaseUrl, max: 10 });
}

export function createDb(pool: pg.Pool) {
  return drizzle(pool, { schema });
}

export type AppDatabase = ReturnType<typeof createDb>;
