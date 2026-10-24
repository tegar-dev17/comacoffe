import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  CatalogForbiddenError,
  CatalogService,
  CatalogValidationError,
} from "../modules/pos/catalog.service.js";
import { adjustOutletStock, InventoryError } from "../modules/pos/inventory.service.js";
import { PERMISSIONS, roleHasPermission } from "../modules/auth/permissions.js";

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2).max(120),
  sku: z.string().max(64).nullable().optional(),
  priceMinor: z.number().int().positive(),
  categoryId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  trackInventory: z.boolean().optional(),
});

const stockAdjustSchema = z.object({
  outletId: z.string().uuid(),
  productId: z.string().uuid(),
  delta: z.number().int(),
  reason: z.string().min(3).max(200),
});

function mapCatalogError(err: unknown) {
  if (err instanceof CatalogValidationError) return { status: 400, body: { error: err.message } };
  if (err instanceof CatalogForbiddenError) return { status: 403, body: { error: err.message } };
  if (err instanceof InventoryError) return { status: 400, body: { error: err.message } };
  return null;
}

export async function registerCatalogRoutes(app: FastifyInstance) {
  const catalog = new CatalogService(app.db);

  app.get(
    "/api/v1/catalog/products",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { outletId?: string; q?: string; admin?: string };
      try {
        if (qs.admin === "1") {
          if (!roleHasPermission(request.auth!.role, PERMISSIONS.PRODUCT_MANAGE)) {
            return reply.status(403).send({ error: "Insufficient permission" });
          }
          const rows = await catalog.listProductsAdmin(request.auth!);
          return {
            data: rows.map((p) => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              priceMinor: p.priceMinor,
              currency: p.currency,
              categoryId: p.categoryId,
              isActive: p.isActive,
              trackInventory: p.trackInventory,
            })),
          };
        }
        if (!qs.outletId) {
          return reply.status(400).send({ error: "outletId required" });
        }
        const rows = await catalog.listProductsForPos(request.auth!, qs.outletId, qs.q);
        return { data: rows };
      } catch (err) {
        const mapped = mapCatalogError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/catalog/products",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const parsed = productSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const row = await catalog.upsertProduct(request.auth!, parsed.data);
        return reply.status(parsed.data.id ? 200 : 201).send({
          data: {
            id: row.id,
            name: row.name,
            sku: row.sku,
            priceMinor: row.priceMinor,
            isActive: row.isActive,
            trackInventory: row.trackInventory,
          },
        });
      } catch (err) {
        const mapped = mapCatalogError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/catalog/categories",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      try {
        const rows = await catalog.listCategories(request.auth!);
        return { data: rows };
      } catch (err) {
        const mapped = mapCatalogError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.post(
    "/api/v1/catalog/inventory/adjust",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      if (!roleHasPermission(request.auth!.role, PERMISSIONS.INVENTORY_MANAGE)) {
        return reply.status(403).send({ error: "Insufficient permission" });
      }
      const parsed = stockAdjustSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }
      try {
        const result = await adjustOutletStock(app.db, {
          tenantId: request.auth!.tenantId,
          outletId: parsed.data.outletId,
          productId: parsed.data.productId,
          delta: parsed.data.delta,
          reason: parsed.data.reason,
          actorUserId: request.auth!.userId,
        });
        return { data: result };
      } catch (err) {
        const mapped = mapCatalogError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );

  app.get(
    "/api/v1/catalog/inventory/low-stock",
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const qs = request.query as { outletId?: string; threshold?: string };
      if (!qs.outletId) return reply.status(400).send({ error: "outletId required" });
      try {
        const threshold = qs.threshold ? Number(qs.threshold) : 5;
        const rows = await catalog.listLowStock(request.auth!, qs.outletId, threshold);
        return { data: rows };
      } catch (err) {
        const mapped = mapCatalogError(err);
        if (mapped) return reply.status(mapped.status).send(mapped.body);
        throw err;
      }
    },
  );
}
