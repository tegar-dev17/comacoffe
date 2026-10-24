import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { tenants, outlets, users, orders } from "./core.js";

export const tenantSettings = pgTable("tenant_settings", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "restrict" }),
  businessName: text("business_name"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  receiptFooter: text("receipt_footer"),
  timezone: text("timezone").notNull().default("Asia/Jakarta"),
  currency: text("currency").notNull().default("IDR"),
  taxRateBps: integer("tax_rate_bps").notNull().default(0),
  serviceChargeBps: integer("service_charge_bps").notNull().default(0),
  requireOpenShift: boolean("require_open_shift").notNull().default(false),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cashierShifts = pgTable(
  "cashier_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    cashierUserId: uuid("cashier_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("open"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    openingCashMinor: bigint("opening_cash_minor", { mode: "number" }).notNull().default(0),
    expectedCashMinor: bigint("expected_cash_minor", { mode: "number" }),
    countedCashMinor: bigint("counted_cash_minor", { mode: "number" }),
    cashVarianceMinor: bigint("cash_variance_minor", { mode: "number" }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("cashier_shifts_one_open_per_outlet_uidx")
      .on(t.outletId)
      .where(sql`${t.status} = 'open'`),
    index("cashier_shifts_tenant_outlet_idx").on(t.tenantId, t.outletId, t.openedAt),
  ],
);

export const shiftCashEvents = pgTable(
  "shift_cash_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    shiftId: uuid("shift_id")
      .notNull()
      .references(() => cashierShifts.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    eventType: text("event_type").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    reason: text("reason"),
    orderId: uuid("order_id").references(() => orders.id, { onDelete: "set null" }),
    actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shift_cash_events_shift_idx").on(t.shiftId, t.createdAt)],
);
