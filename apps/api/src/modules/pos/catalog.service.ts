import { and, asc, eq, ilike, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../db/schema/index.js";
import type { AuthContext } from "../auth/types.js";
import { PERMISSIONS, roleHasPermission } from "../auth/permissions.js";

type Db = NodePgDatabase<typeof schema>;

export class CatalogForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogForbiddenError";
  }
}

export class CatalogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogValidationError";
  }
}

export class CatalogService {
  constructor(private readonly db: Db) {}

  private assertPermission(auth: AuthContext, permission: string) {
    if (!roleHasPermission(auth.role, permission as (typeof PERMISSIONS)[keyof typeof PERMISSIONS])) {
      throw new CatalogForbiddenError("Insufficient permission");
    }
  }

  async listProductsForPos(auth: AuthContext, outletId: string, q?: string) {
    this.assertPermission(auth, PERMISSIONS.PRODUCT_READ);
    if (auth.outletId && auth.role === "cashier" && outletId !== auth.outletId) {
      throw new CatalogForbiddenError("Outlet access denied");
    }

    const conditions = [
      eq(schema.products.tenantId, auth.tenantId),
      eq(schema.products.isActive, true),
    ];
    if (q?.trim()) {
      const term = `%${q.trim()}%`;
      conditions.push(or(ilike(schema.products.name, term), ilike(schema.products.sku, term))!);
    }

    const rows = await this.db
      .select({
        id: schema.products.id,
        name: schema.products.name,
        sku: schema.products.sku,
        priceMinor: schema.products.priceMinor,
        currency: schema.products.currency,
        categoryId: schema.products.categoryId,
        trackInventory: schema.products.trackInventory,
        quantityOnHand: schema.outletProductStock.quantityOnHand,
      })
      .from(schema.products)
      .leftJoin(
        schema.outletProductStock,
        and(
          eq(schema.outletProductStock.productId, schema.products.id),
          eq(schema.outletProductStock.outletId, outletId),
        ),
      )
      .where(and(...conditions))
      .orderBy(asc(schema.products.name));

    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      sku: r.sku,
      priceMinor: r.priceMinor,
      currency: r.currency,
      categoryId: r.categoryId,
      trackInventory: r.trackInventory,
      quantityOnHand: r.quantityOnHand ?? 0,
    }));
  }

  async listProductsAdmin(auth: AuthContext) {
    this.assertPermission(auth, PERMISSIONS.PRODUCT_MANAGE);
    return this.db.query.products.findMany({
      where: eq(schema.products.tenantId, auth.tenantId),
      orderBy: asc(schema.products.name),
    });
  }

  async upsertProduct(
    auth: AuthContext,
    input: {
      id?: string;
      name: string;
      sku?: string | null;
      priceMinor: number;
      categoryId?: string | null;
      isActive?: boolean;
      trackInventory?: boolean;
    },
  ) {
    this.assertPermission(auth, PERMISSIONS.PRODUCT_MANAGE);
    if (input.priceMinor <= 0) throw new CatalogValidationError("Price must be positive");

    const now = new Date();
    if (input.id) {
      const [updated] = await this.db
        .update(schema.products)
        .set({
          name: input.name,
          sku: input.sku ?? null,
          priceMinor: input.priceMinor,
          categoryId: input.categoryId ?? null,
          isActive: input.isActive ?? true,
          trackInventory: input.trackInventory ?? true,
          updatedAt: now,
        })
        .where(and(eq(schema.products.id, input.id), eq(schema.products.tenantId, auth.tenantId)))
        .returning();
      if (!updated) throw new CatalogValidationError("Product not found");
      return updated;
    }

    const [created] = await this.db
      .insert(schema.products)
      .values({
        tenantId: auth.tenantId,
        name: input.name,
        sku: input.sku ?? null,
        priceMinor: input.priceMinor,
        categoryId: input.categoryId ?? null,
        isActive: input.isActive ?? true,
        trackInventory: input.trackInventory ?? true,
      })
      .returning();

    const outlets = await this.db.query.outlets.findMany({
      where: eq(schema.outlets.tenantId, auth.tenantId),
    });
    for (const outlet of outlets) {
      await this.db.insert(schema.outletProductStock).values({
        outletId: outlet.id,
        productId: created!.id,
        quantityOnHand: 0,
      });
    }

    return created!;
  }

  async listCategories(auth: AuthContext) {
    this.assertPermission(auth, PERMISSIONS.PRODUCT_READ);
    return this.db.query.productCategories.findMany({
      where: and(
        eq(schema.productCategories.tenantId, auth.tenantId),
        eq(schema.productCategories.isActive, true),
      ),
      orderBy: asc(schema.productCategories.sortOrder),
    });
  }

  async upsertCategory(auth: AuthContext, input: { id?: string; name: string; sortOrder?: number }) {
    this.assertPermission(auth, PERMISSIONS.PRODUCT_MANAGE);
    const now = new Date();
    if (input.id) {
      const [updated] = await this.db
        .update(schema.productCategories)
        .set({
          name: input.name,
          sortOrder: input.sortOrder ?? 0,
          updatedAt: now,
        })
        .where(
          and(
            eq(schema.productCategories.id, input.id),
            eq(schema.productCategories.tenantId, auth.tenantId),
          ),
        )
        .returning();
      if (!updated) throw new CatalogValidationError("Category not found");
      return updated;
    }
    const [created] = await this.db
      .insert(schema.productCategories)
      .values({
        tenantId: auth.tenantId,
        name: input.name,
        sortOrder: input.sortOrder ?? 0,
      })
      .returning();
    return created!;
  }

  async listLowStock(auth: AuthContext, outletId: string, threshold = 5) {
    this.assertPermission(auth, PERMISSIONS.INVENTORY_MANAGE);
    const rows = await this.db
      .select({
        productId: schema.products.id,
        productName: schema.products.name,
        quantityOnHand: schema.outletProductStock.quantityOnHand,
      })
      .from(schema.products)
      .innerJoin(
        schema.outletProductStock,
        eq(schema.outletProductStock.productId, schema.products.id),
      )
      .where(
        and(
          eq(schema.products.tenantId, auth.tenantId),
          eq(schema.outletProductStock.outletId, outletId),
          eq(schema.products.trackInventory, true),
          sql`${schema.outletProductStock.quantityOnHand} <= ${threshold}`,
        ),
      )
      .orderBy(asc(schema.outletProductStock.quantityOnHand));
    return rows;
  }
}
