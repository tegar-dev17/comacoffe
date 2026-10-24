/**
 * One-time demo tenant seed for staging/production when dev routes are disabled.
 * Run: ALLOW_DEMO_SEED=1 npm run db:seed-demo -w @comacoffe/api
 */
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { createDb, createDbPool } from "../db/client.js";
import * as schema from "../db/schema/index.js";
import { hashPassword } from "../modules/auth/password.js";

const DEMO_PASSWORD = process.env.DEMO_SEED_PASSWORD ?? "demo1234";

async function main() {
  if (process.env.ALLOW_DEMO_SEED !== "1") {
    console.error("Refusing to seed: set ALLOW_DEMO_SEED=1 for this one-time operation.");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && !process.env.DEMO_SEED_PASSWORD) {
    console.error("Set DEMO_SEED_PASSWORD when seeding in NODE_ENV=production.");
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required");

  const pool = createDbPool(url);
  const db = createDb(pool);

  const existing = await db.query.tenants.findFirst({
    where: eq(schema.tenants.slug, "demo-coffee"),
  });
  const passwordHash = hashPassword(DEMO_PASSWORD);

  if (existing) {
    console.log("Demo tenant already exists:", existing.id);
    for (const email of ["admin@demo.coffee", "cashier@demo.coffee"]) {
      await db
        .update(schema.users)
        .set({ passwordHash, isActive: true, updatedAt: new Date() })
        .where(and(eq(schema.users.tenantId, existing.id), eq(schema.users.email, email)));
    }
    const outlet = await db.query.outlets.findFirst({
      where: eq(schema.outlets.tenantId, existing.id),
    });
    const productCount = await db.query.products.findMany({
      where: eq(schema.products.tenantId, existing.id),
      limit: 1,
    });
    if (outlet && productCount.length === 0) {
      const [coffeeCat] = await db
        .insert(schema.productCategories)
        .values({ tenantId: existing.id, name: "Coffee", sortOrder: 1 })
        .returning();
      const [product] = await db
        .insert(schema.products)
        .values({
          tenantId: existing.id,
          name: "Espresso",
          sku: "ESP-E2E",
          priceMinor: 18000,
          categoryId: coffeeCat!.id,
        })
        .returning();
      await db.insert(schema.outletProductStock).values({
        outletId: outlet.id,
        productId: product!.id,
        quantityOnHand: 50,
      });
      console.log("Added fallback demo product for E2E");
    }
    console.log("Refreshed demo user passwords for tenant", existing.id);
    await pool.end();
    return;
  }

  const [tenant] = await db
    .insert(schema.tenants)
    .values({ name: "Demo Coffee", slug: "demo-coffee" })
    .returning();
  const [outlet] = await db
    .insert(schema.outlets)
    .values({ tenantId: tenant!.id, name: "Senayan", code: "SNY01" })
    .returning();
  const [coffeeCat] = await db
    .insert(schema.productCategories)
    .values({ tenantId: tenant!.id, name: "Coffee", sortOrder: 1 })
    .returning();
  const [pastryCat] = await db
    .insert(schema.productCategories)
    .values({ tenantId: tenant!.id, name: "Pastry", sortOrder: 2 })
    .returning();
  const catalog = [
    { name: "Espresso", sku: "ESP-001", priceMinor: 18000, categoryId: coffeeCat!.id },
    { name: "Cappuccino", sku: "CAP-001", priceMinor: 28000, categoryId: coffeeCat!.id },
    { name: "Latte", sku: "LAT-001", priceMinor: 30000, categoryId: coffeeCat!.id },
  ];
  for (const item of catalog) {
    const [product] = await db
      .insert(schema.products)
      .values({ tenantId: tenant!.id, ...item })
      .returning();
    await db.insert(schema.outletProductStock).values({
      outletId: outlet!.id,
      productId: product!.id,
      quantityOnHand: 50,
    });
  }

  await db.insert(schema.users).values([
    {
      tenantId: tenant!.id,
      email: "admin@demo.coffee",
      displayName: "Admin Demo",
      role: "admin",
      outletId: null,
      passwordHash,
    },
    {
      tenantId: tenant!.id,
      email: "cashier@demo.coffee",
      displayName: "Kasir Demo",
      role: "cashier",
      outletId: outlet!.id,
      passwordHash,
    },
  ]);

  console.log("Demo tenant seeded. Login: cashier@demo.coffee (password from DEMO_SEED_PASSWORD or default demo1234)");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
