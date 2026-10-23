import {
  pgTable,
  uuid,
  text,
  timestamp,
  bigint,
  index,
  uniqueIndex,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";
import { orders, tenants, outlets, users } from "./core.js";
import {
  paymentStatusEnum,
  paymentProviderEnum,
  paymentMethodEnum,
  refundStatusEnum,
  refundApprovalStatusEnum,
  webhookProcessingStatusEnum,
  reconciliationStatusEnum,
  settlementStatusEnum,
} from "./enums.js";

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    outletId: uuid("outlet_id")
      .notNull()
      .references(() => outlets.id, { onDelete: "restrict" }),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "restrict" }),
    provider: paymentProviderEnum("provider").notNull(),
    providerPaymentId: text("provider_payment_id"),
    providerReference: text("provider_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    status: paymentStatusEnum("status").notNull().default("CREATED"),
    settlementStatus: settlementStatusEnum("settlement_status").notNull().default("UNKNOWN"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    succeededAt: timestamp("succeeded_at", { withTimezone: true }),
    failedAt: timestamp("failed_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payments_tenant_idempotency_uidx").on(t.tenantId, t.idempotencyKey),
    uniqueIndex("payments_provider_payment_uidx").on(t.provider, t.providerPaymentId),
    index("payments_tenant_outlet_idx").on(t.tenantId, t.outletId),
    index("payments_order_idx").on(t.orderId),
    index("payments_status_idx").on(t.status),
  ],
);

export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    attemptNumber: bigint("attempt_number", { mode: "number" }).notNull(),
    providerRequestJson: jsonb("provider_request_json"),
    providerResponseJson: jsonb("provider_response_json"),
    httpStatus: bigint("http_status", { mode: "number" }),
    errorMessage: text("error_message"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_attempts_payment_idx").on(t.paymentId)],
);

export const paymentEvents = pgTable(
  "payment_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    fromStatus: paymentStatusEnum("from_status"),
    toStatus: paymentStatusEnum("to_status").notNull(),
    source: text("source").notNull(),
    providerEventId: text("provider_event_id"),
    payloadJson: jsonb("payload_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_events_payment_idx").on(t.paymentId, t.createdAt)],
);

export const paymentWebhookEvents = pgTable(
  "payment_webhook_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    provider: paymentProviderEnum("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    paymentId: uuid("payment_id").references(() => payments.id, { onDelete: "set null" }),
    rawHeadersJson: jsonb("raw_headers_json"),
    rawBodyJson: jsonb("raw_body_json"),
    signatureValid: boolean("signature_valid"),
    processingStatus: webhookProcessingStatusEnum("processing_status").notNull().default("RECEIVED"),
    processingError: text("processing_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_webhook_provider_event_uidx").on(t.provider, t.providerEventId),
    index("payment_webhook_payment_idx").on(t.paymentId),
  ],
);

export const paymentRefunds = pgTable(
  "payment_refunds",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "restrict" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    currency: text("currency").notNull().default("IDR"),
    reason: text("reason").notNull(),
    status: refundStatusEnum("status").notNull().default("PENDING"),
    idempotencyKey: text("idempotency_key").notNull(),
    providerRefundId: text("provider_refund_id"),
    requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
    approvalStatus: refundApprovalStatusEnum("approval_status").notNull().default("NOT_REQUIRED"),
    approvedByUserId: uuid("approved_by_user_id").references(() => users.id),
    rejectedByUserId: uuid("rejected_by_user_id").references(() => users.id),
    rejectionReason: text("rejection_reason"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("payment_refunds_tenant_idempotency_uidx").on(t.tenantId, t.idempotencyKey),
    index("payment_refunds_payment_idx").on(t.paymentId),
  ],
);

export const paymentReconciliations = pgTable(
  "payment_reconciliations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    status: reconciliationStatusEnum("status").notNull(),
    internalStatus: paymentStatusEnum("internal_status").notNull(),
    providerStatus: text("provider_status"),
    amountMinorInternal: bigint("amount_minor_internal", { mode: "number" }),
    amountMinorProvider: bigint("amount_minor_provider", { mode: "number" }),
    notes: text("notes"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_reconciliations_payment_idx").on(t.paymentId, t.createdAt)],
);

export const paymentSettlements = pgTable(
  "payment_settlements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => payments.id, { onDelete: "cascade" }),
    providerSettlementId: text("provider_settlement_id"),
    status: settlementStatusEnum("status").notNull().default("PENDING"),
    amountMinor: bigint("amount_minor", { mode: "number" }),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    metadataJson: jsonb("metadata_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("payment_settlements_payment_idx").on(t.paymentId)],
);

export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "restrict" }),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    responseJson: jsonb("response_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("idempotency_tenant_scope_key_uidx").on(t.tenantId, t.scope, t.idempotencyKey),
  ],
);

export const transactionalOutbox = pgTable(
  "transactional_outbox",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "set null" }),
    aggregateType: text("aggregate_type").notNull(),
    aggregateId: uuid("aggregate_id").notNull(),
    eventType: text("event_type").notNull(),
    dedupeKey: text("dedupe_key"),
    payloadJson: jsonb("payload_json").notNull(),
    attempts: bigint("attempts", { mode: "number" }).notNull().default(0),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    lastError: text("last_error"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("transactional_outbox_unprocessed_idx").on(t.processedAt, t.nextRetryAt, t.createdAt),
    uniqueIndex("transactional_outbox_dedupe_uidx").on(t.dedupeKey),
  ],
);
