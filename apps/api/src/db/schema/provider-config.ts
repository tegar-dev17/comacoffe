import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { tenants, outlets, users } from "./core.js";
import {
  paymentProviderEnum,
  providerEnvironmentEnum,
  merchantConfigStatusEnum,
} from "./enums.js";

/** Per-tenant (optional outlet) provider settings — secrets referenced, not stored in plaintext. */
export const merchantProviderConfigs = pgTable(
  "merchant_provider_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id").references(() => outlets.id, { onDelete: "cascade" }),
    provider: paymentProviderEnum("provider").notNull(),
    environment: providerEnvironmentEnum("environment").notNull(),
    merchantReference: text("merchant_reference"),
    enabledMethods: jsonb("enabled_methods").$type<string[]>(),
    /** e.g. env:DEFAULT_MIDTRANS_SERVER_KEY or vault:tenant/<uuid>/midtrans/server_key */
    serverCredentialRef: text("server_credential_ref"),
    clientCredentialRef: text("client_credential_ref"),
    webhookCredentialRef: text("webhook_credential_ref"),
    apiBaseUrl: text("api_base_url"),
    status: merchantConfigStatusEnum("status").notNull().default("active"),
    createdByUserId: uuid("created_by_user_id").references(() => users.id),
    updatedByUserId: uuid("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("merchant_provider_cfg_scope_uidx").on(
      t.tenantId,
      t.outletId,
      t.provider,
      t.environment,
    ),
    index("merchant_provider_cfg_tenant_idx").on(t.tenantId),
  ],
);

export const merchantProviderConfigAudits = pgTable(
  "merchant_provider_config_audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    configId: uuid("config_id")
      .notNull()
      .references(() => merchantProviderConfigs.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    actorUserId: uuid("actor_user_id").references(() => users.id),
    action: text("action").notNull(),
    beforeJson: jsonb("before_json"),
    afterJson: jsonb("after_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("merchant_provider_cfg_audit_idx").on(t.configId, t.createdAt)],
);
