import { and, eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";

type Db = NodePgDatabase<typeof schema>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

export class InventoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InventoryError";
  }
}

export async function commitOrderInventory(
  tx: Tx,
  params: {
    tenantId: string;
    outletId: string;
    orderId: string;
    actorUserId?: string;
  },
): Promise<void> {
  const order = await tx.query.orders.findFirst({
    where: and(eq(schema.orders.id, params.orderId), eq(schema.orders.tenantId, params.tenantId)),
  });
  if (!order) throw new InventoryError("Order not found");
  if (order.inventoryCommittedAt) return;

  const lines = await tx.query.orderItems.findMany({
    where: eq(schema.orderItems.orderId, order.id),
  });
  if (lines.length === 0) return;

  for (const line of lines) {
    if (!line.productId) continue;
    const product = await tx.query.products.findFirst({
      where: eq(schema.products.id, line.productId),
    });
    if (!product?.trackInventory) continue;

    await tx.execute(
      sql`SELECT id FROM outlet_product_stock WHERE outlet_id = ${params.outletId} AND product_id = ${line.productId} FOR UPDATE`,
    );

    let stock = await tx.query.outletProductStock.findFirst({
      where: and(
        eq(schema.outletProductStock.outletId, params.outletId),
        eq(schema.outletProductStock.productId, line.productId),
      ),
    });

    if (!stock) {
      const inserted = await tx
        .insert(schema.outletProductStock)
        .values({
          outletId: params.outletId,
          productId: line.productId,
          quantityOnHand: 0,
        })
        .returning();
      stock = inserted[0];
    }

    const nextQty = (stock?.quantityOnHand ?? 0) - line.quantity;
    if (nextQty < 0) {
      throw new InventoryError(`Insufficient stock for ${line.productName}`);
    }

    await tx
      .update(schema.outletProductStock)
      .set({ quantityOnHand: nextQty, updatedAt: new Date() })
      .where(eq(schema.outletProductStock.id, stock!.id));

    await tx.insert(schema.inventoryMovements).values({
      tenantId: params.tenantId,
      outletId: params.outletId,
      productId: line.productId,
      delta: -line.quantity,
      reason: "sale",
      referenceType: "order",
      referenceId: order.id,
      actorUserId: params.actorUserId,
    });
  }

  await tx
    .update(schema.orders)
    .set({ inventoryCommittedAt: new Date(), updatedAt: new Date() })
    .where(eq(schema.orders.id, order.id));
}

export async function adjustOutletStock(
  db: Db,
  params: {
    tenantId: string;
    outletId: string;
    productId: string;
    delta: number;
    reason: string;
    actorUserId: string;
  },
): Promise<{ quantityOnHand: number }> {
  if (params.delta === 0) throw new InventoryError("Delta must be non-zero");

  return db.transaction(async (tx) => {
    const product = await tx.query.products.findFirst({
      where: and(
        eq(schema.products.id, params.productId),
        eq(schema.products.tenantId, params.tenantId),
      ),
    });
    if (!product) throw new InventoryError("Product not found");

    const outlet = await tx.query.outlets.findFirst({
      where: and(
        eq(schema.outlets.id, params.outletId),
        eq(schema.outlets.tenantId, params.tenantId),
      ),
    });
    if (!outlet) throw new InventoryError("Outlet not found");

    await tx.execute(
      sql`SELECT id FROM outlet_product_stock WHERE outlet_id = ${params.outletId} AND product_id = ${params.productId} FOR UPDATE`,
    );

    let stock = await tx.query.outletProductStock.findFirst({
      where: and(
        eq(schema.outletProductStock.outletId, params.outletId),
        eq(schema.outletProductStock.productId, params.productId),
      ),
    });

    if (!stock) {
      const inserted = await tx
        .insert(schema.outletProductStock)
        .values({
          outletId: params.outletId,
          productId: params.productId,
          quantityOnHand: 0,
        })
        .returning();
      stock = inserted[0];
    }

    const nextQty = (stock?.quantityOnHand ?? 0) + params.delta;
    if (nextQty < 0) throw new InventoryError("Stock cannot be negative");

    await tx
      .update(schema.outletProductStock)
      .set({ quantityOnHand: nextQty, updatedAt: new Date() })
      .where(eq(schema.outletProductStock.id, stock!.id));

    await tx.insert(schema.inventoryMovements).values({
      tenantId: params.tenantId,
      outletId: params.outletId,
      productId: params.productId,
      delta: params.delta,
      reason: params.reason,
      referenceType: "adjustment",
      actorUserId: params.actorUserId,
    });

    return { quantityOnHand: nextQty };
  });
}
