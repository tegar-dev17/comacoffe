import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  boolean,
  integer,
} from "drizzle-orm/pg-core";
import { tenants, outlets, users, orders } from "./core.js";

export const productCategories = pgTable(
  "product_categories",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("product_categories_tenant_name_uidx").on(t.tenantId, t.name),
    index("product_categories_tenant_idx").on(t.tenantId),
  ],
);

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    sku: text("sku"),
    priceMinor: bigint("price_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    isActive: boolean("is_active").notNull().default(true),
    trackInventory: boolean("track_inventory").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_tenant_category_idx").on(t.tenantId, t.categoryId),
    index("products_tenant_active_idx").on(t.tenantId, t.isActive),
    uniqueIndex("products_tenant_sku_uidx").on(t.tenantId, t.sku),
  ],
);

export const outletProductStock = pgTable(
  "outlet_product_stock",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    quantityOnHand: integer("quantity_on_hand").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("outlet_product_stock_outlet_product_uidx").on(t.outletId, t.productId)],
);

export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("inventory_movements_outlet_product_idx").on(t.outletId, t.productId, t.createdAt),
    index("inventory_movements_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    productName: text("product_name").notNull(),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalMinor: bigint("line_total_minor", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("order_items_order_idx").on(t.orderId)],
);
