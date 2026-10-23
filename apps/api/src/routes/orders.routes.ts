import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import * as schema from "../db/schema/index.js";

const createOrderSchema = z.object({
  outletId: z.string().uuid(),
  orderNumber: z.string().min(3).max(64),
  totalMinor: z.number().int().positive(),
  currency: z.string().default("IDR"),
  localOperationId: z.string().uuid().optional(),
  deviceId: z.string().optional(),
});

export async function registerOrderRoutes(app: FastifyInstance) {
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
      return {
        data: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: order.status,
          totalMinor: order.totalMinor,
          currency: order.currency,
          paidAt: order.paidAt?.toISOString() ?? null,
        },
      };
    },
  );
}
