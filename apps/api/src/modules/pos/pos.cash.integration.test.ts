import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadEnv } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import { setupIntegrationDb } from "../../test/setup.integration.js";
import type { AppDatabase } from "../../db/client.js";
import type pg from "pg";
import { PosService } from "./pos.service.js";

describe("POS cash checkout", () => {
  let db: AppDatabase;
  let pool: pg.Pool;
  let cashier: {
    userId: string;
    tenantId: string;
    role: string;
    outletId: string;
    email: string;
  };
  let productId: string;
  let outletId: string;

  beforeAll(async () => {
    const setup = await setupIntegrationDb();
    db = setup.db;
    pool = setup.pool;
    const suffix = crypto.randomUUID().slice(0, 8);

    const [tenant] = await db
      .insert(schema.tenants)
      .values({ name: "POS Test", slug: `pos-${suffix}` })
      .returning();
    const [outlet] = await db
      .insert(schema.outlets)
      .values({ tenantId: tenant!.id, name: "Outlet", code: `OUT-${suffix}` })
      .returning();
    outletId = outlet!.id;

    const [user] = await db
      .insert(schema.users)
      .values({
        tenantId: tenant!.id,
        email: `cashier-${suffix}@example.com`,
        displayName: "Cashier",
        role: "cashier",
        outletId: outlet!.id,
      })
      .returning();

    cashier = {
      userId: user!.id,
      tenantId: tenant!.id,
      role: "cashier",
      outletId: outlet!.id,
      email: user!.email,
    };

    const [product] = await db
      .insert(schema.products)
      .values({
        tenantId: tenant!.id,
        name: "Americano",
        sku: `AME-${suffix}`,
        priceMinor: 20000,
      })
      .returning();
    productId = product!.id;

    await db.insert(schema.outletProductStock).values({
      outletId,
      productId,
      quantityOnHand: 10,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  it("creates paid order, payment, and decrements stock once", async () => {
    const env = loadEnv();
    const pos = new PosService(db, env);
    const result = await pos.checkout(cashier, {
      outletId,
      items: [{ productId, quantity: 2 }],
      paymentMethod: "cash",
      idempotencyKey: `pos-cash-${crypto.randomUUID()}`,
    });

    expect(result.order.totalMinor).toBe(40000);
    expect((result.payment as { status: string }).status).toBe("SUCCEEDED");

    const order = await db.query.orders.findFirst({
      where: eq(schema.orders.id, result.order.id),
    });
    expect(order?.status).toBe("paid");
    expect(order?.inventoryCommittedAt).toBeTruthy();

    const stock = await db.query.outletProductStock.findFirst({
      where: and(
        eq(schema.outletProductStock.outletId, outletId),
        eq(schema.outletProductStock.productId, productId),
      ),
    });
    expect(stock?.quantityOnHand).toBe(8);

    const items = await db.query.orderItems.findMany({
      where: eq(schema.orderItems.orderId, result.order.id),
    });
    expect(items).toHaveLength(1);
    expect(items[0]?.lineTotalMinor).toBe(40000);
  });

  it("rejects checkout when stock is insufficient", async () => {
    const env = loadEnv();
    const pos = new PosService(db, env);
    await expect(
      pos.checkout(cashier, {
        outletId,
        items: [{ productId, quantity: 100 }],
        paymentMethod: "cash",
        idempotencyKey: `pos-fail-${crypto.randomUUID()}`,
      }),
    ).rejects.toThrow(/Insufficient stock/);
  });
});
