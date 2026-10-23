import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDb, createDbPool } from "./client.js";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const pool = createDbPool(url);
  const db = createDb(pool);
  await migrate(db, { migrationsFolder: "./drizzle" });
  await pool.end();
  console.log("Migrations applied");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
