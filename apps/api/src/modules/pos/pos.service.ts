import { and, eq, inArray, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { v4 as uuidv4 } from "uuid";
import type { Env } from "../../config/env.js";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";
import { PaymentService } from "../payment/services/payment.service.js";

type Db = NodePgDatabase<typeof schema>;

export class PosForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosForbiddenError";
  }
}

export class PosValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PosValidationError";
  }
}

export class PosService {
  private readonly payments: PaymentService;

  constructor(
    private readonly db: Db,
    private readonly env: Env,
  ) {
    this.payments = new PaymentService(db, env);
  }

  private assertPermission(auth: AuthContext, permission: string) {
    if (!roleHasPermission(auth.role, permission as (typeof PERMISSIONS)[keyof typeof PERMISSIONS])) {
      throw new PosForbiddenError("Insufficient permission");
    }
  }

  private resolveOutletId(auth: AuthContext, outletId: string) {
    if (auth.outletId && auth.role === "cashier" && outletId !== auth.outletId) {
      throw new PosForbiddenError("Outlet access denied");
    }
    return outletId;
  }

  async checkout(
    auth: AuthContext,
    input: {
      outletId: string;
      items: Array<{ productId: string; quantity: number }>;
      paymentMethod: "cash" | "qris";
      idempotencyKey: string;
      provider?: "midtrans" | "xendit";
      localOperationId?: string;
      deviceId?: string;
    },
  ) {
    this.assertPermission(auth, PERMISSIONS.POS_CHECKOUT);
    const outletId = this.resolveOutletId(auth, input.outletId);

    if (input.items.length === 0) {
      throw new PosValidationError("Cart is empty");
    }

    for (const line of input.items) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new PosValidationError("Invalid quantity");
      }
    }

    const outlet = await this.db.query.outlets.findFirst({
      where: and(eq(schema.outlets.id, outletId), eq(schema.outlets.tenantId, auth.tenantId)),
    });
    if (!outlet) throw new PosValidationError("Outlet not found");

    const productIds = [...new Set(input.items.map((i) => i.productId))];
    const products = await this.db.query.products.findMany({
      where: and(
        eq(schema.products.tenantId, auth.tenantId),
        inArray(schema.products.id, productIds),
      ),
    });
    const productMap = new Map(products.map((p) => [p.id, p]));

    const normalizedLines: Array<{
      productId: string;
      productName: string;
      unitPriceMinor: number;
      quantity: number;
      lineTotalMinor: number;
    }> = [];

    for (const line of input.items) {
      const product = productMap.get(line.productId);
      if (!product || !product.isActive) {
        throw new PosValidationError("Product unavailable");
      }
      const lineTotalMinor = product.priceMinor * line.quantity;
      normalizedLines.push({
        productId: product.id,
        productName: product.name,
        unitPriceMinor: product.priceMinor,
        quantity: line.quantity,
        lineTotalMinor,
      });
    }

    const totalMinor = normalizedLines.reduce((sum, l) => sum + l.lineTotalMinor, 0);
    if (totalMinor <= 0) throw new PosValidationError("Invalid order total");

    const orderNumber = `POS-${Date.now().toString(36).toUpperCase()}-${uuidv4().slice(0, 6)}`;

    const orderId = await this.db.transaction(async (tx) => {
      for (const pid of productIds) {
        const product = productMap.get(pid)!;
        if (!product.trackInventory) continue;
        await tx.execute(
          sql`SELECT id FROM outlet_product_stock WHERE outlet_id = ${outletId} AND product_id = ${pid} FOR UPDATE`,
        );
        const stock = await tx.query.outletProductStock.findFirst({
          where: and(
            eq(schema.outletProductStock.outletId, outletId),
            eq(schema.outletProductStock.productId, pid),
          ),
        });
        const requested = input.items
          .filter((i) => i.productId === pid)
          .reduce((s, i) => s + i.quantity, 0);
        const onHand = stock?.quantityOnHand ?? 0;
        if (onHand < requested) {
          throw new PosValidationError(`Insufficient stock for ${product.name}`);
        }
      }

      const [order] = await tx
        .insert(schema.orders)
        .values({
          tenantId: auth.tenantId,
          outletId,
          orderNumber,
          totalMinor,
          currency: "IDR",
          status: "pending_payment",
          createdByUserId: auth.userId,
          localOperationId: input.localOperationId,
          deviceId: input.deviceId,
        })
        .returning();

      await tx.insert(schema.orderItems).values(
        normalizedLines.map((l) => ({
          orderId: order!.id,
          productId: l.productId,
          productName: l.productName,
          unitPriceMinor: l.unitPriceMinor,
          quantity: l.quantity,
          lineTotalMinor: l.lineTotalMinor,
        })),
      );

      return order!.id;
    });

    const payment = await this.payments.createPayment(auth, {
      orderId,
      paymentMethod: input.paymentMethod,
      idempotencyKey: input.idempotencyKey,
      provider: input.provider,
      localOperationId: input.localOperationId,
      deviceId: input.deviceId,
    });

    return {
      order: {
        id: orderId,
        orderNumber,
        totalMinor,
        currency: "IDR",
      },
      payment,
    };
  }
}
