import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "../db/schema/index.js";
import { PERMISSIONS, roleHasPermission } from "../modules/auth/permissions.js";

const createOrderSchema = z.object({
  outletId: z.string().uuid(),
  orderNumber: z.string().min(3).max(64),
  totalMinor: z.number().int().positive(),
  currency: z.string().default("IDR"),
  localOperationId: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

export async function registerOrderRoutes(app: FastifyInstance) {
  app.get(
    "/api/v1/orders",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!roleHasPermission(request.auth!.role, PERMISSIONS.ORDER_READ)) {
        return reply.status(403).send({ error: "Insufficient permission" });
      }
      const qs = request.query as {
        outletId?: string;
        status?: string;
        from?: string;
        to?: string;
        page?: string;
        limit?: string;
      };
      const page = Math.max(1, Number(qs.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(qs.limit ?? 20)));
      const offset = (page - 1) * limit;

      const conditions = [eq(schema.orders.tenantId, request.auth!.tenantId)];
      if (qs.outletId) conditions.push(eq(schema.orders.outletId, qs.outletId));
      if (request.auth!.outletId && request.auth!.role === "cashier") {
        conditions.push(eq(schema.orders.outletId, request.auth!.outletId));
      }
      if (qs.status) {
        conditions.push(eq(schema.orders.status, qs.status as "paid"));
      }
      if (qs.from) conditions.push(gte(schema.orders.createdAt, new Date(qs.from)));
      if (qs.to) conditions.push(lte(schema.orders.createdAt, new Date(qs.to)));

      const rows = await app.db.query.orders.findMany({
        where: and(...conditions),
        orderBy: desc(schema.orders.createdAt),
        limit,
        offset,
      });

      const totalRows = await app.db
        .select({ total: sql<number>`count(*)::int` })
        .from(schema.orders)
        .where(and(...conditions));
      const total = totalRows[0]?.total ?? 0;

      return {
        data: rows.map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          status: o.status,
          totalMinor: o.totalMinor,
          currency: o.currency,
          outletId: o.outletId,
          paidAt: o.paidAt?.toISOString() ?? null,
          createdAt: o.createdAt.toISOString(),
        })),
        pagination: { page, limit, total: total ?? 0 },
      };
    },
  );

  app.post(
    "/api/v1/orders",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      const auth = request.auth!;
      if (auth.outletId && auth.role === "cashier" && parsed.data.outletId !== auth.outletId) {
        return reply.status(403).send({ error: "Outlet access denied" });
      }

      const outlet = await app.db.query.outlets.findFirst({
        where: and(
          eq(schema.outlets.id, parsed.data.outletId),
          eq(schema.outlets.tenantId, auth.tenantId),
        ),
      });
      if (!outlet) {
        return reply.status(404).send({ error: "Outlet not found" });
      }

      const [order] = await app.db
        .insert(schema.orders)
        .values({
          tenantId: auth.tenantId,
          outletId: parsed.data.outletId,
          orderNumber: parsed.data.orderNumber,
          totalMinor: parsed.data.totalMinor,
          currency: parsed.data.currency,
          status: "pending_payment",
          localOperationId: parsed.data.localOperationId,
          deviceId: parsed.data.deviceId,
          createdByUserId: auth.userId,
        })
        .returning();

      return reply.status(201).send({
        data: {
          id: order!.id,
          orderNumber: order!.orderNumber,
          status: order!.status,
          totalMinor: order!.totalMinor,
          currency: order!.currency,
        },
      });
    },
  );

  app.get(
    "/api/v1/orders/:orderId",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { orderId } = request.params as { orderId: string };
      const order = await app.db.query.orders.findFirst({
        where: and(
          eq(schema.orders.id, orderId),
          eq(schema.orders.tenantId, request.auth!.tenantId),
        ),
      });
      if (!order) return reply.status(404).send({ error: "Order not found" });
      if (
        request.auth!.outletId &&
        request.auth!.role === "cashier" &&
        order.outletId !== request.auth!.outletId
      ) {
        return reply.status(403).send({ error: "Outlet access denied" });
      }
      const items = await app.db.query.orderItems.findMany({
        where: eq(schema.orderItems.orderId, order.id),
      });
      const payments = await app.db.query.payments.findMany({
        where: eq(schema.payments.orderId, order.id),
      });
      return {
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
          paidAt: order.paidAt?.toISOString() ?? null,
          createdAt: order.createdAt.toISOString(),
          items: items.map((i) => ({
            id: i.id,
            productName: i.productName,
            unitPriceMinor: i.unitPriceMinor,
            quantity: i.quantity,
            lineTotalMinor: i.lineTotalMinor,
          })),
          payments: payments.map((p) => ({
            id: p.id,
            status: p.status,
            paymentMethod: p.paymentMethod,
            amountMinor: p.amountMinor,
          })),
        },
      };
    },
  );
}
