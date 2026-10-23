import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool } from "../db/client.js";

export async function setupIntegrationDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for integration tests");
  const pool = createDbPool(url);
  const db = createDb(pool);
  const migrationsFolder = path.join(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle");
  await migrate(db, { migrationsFolder });
  return { db, pool };
}
