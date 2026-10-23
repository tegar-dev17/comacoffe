import { pgEnum } from "drizzle-orm/pg-core";

export const paymentStatusEnum = pgEnum("payment_status", [
  "CREATED",
  "PENDING",
  "SUCCEEDED",
  "FAILED",
  "EXPIRED",
  "CANCELLED",
  "UNKNOWN",
  "REFUND_PENDING",
  "PARTIALLY_REFUNDED",
  "REFUNDED",
]);

export const paymentProviderEnum = pgEnum("payment_provider", ["midtrans", "xendit", "cash"]);

export const paymentMethodEnum = pgEnum("payment_method", ["qris", "cash", "card", "ewallet", "other"]);

export const orderStatusEnum = pgEnum("order_status", [
  "draft",
  "pending_payment",
  "paid",
  "cancelled",
  "refunded",
]);

export const refundStatusEnum = pgEnum("refund_status", [
  "PENDING",
  "PENDING_APPROVAL",
  "PENDING_PROVIDER",
  "SUCCEEDED",
  "FAILED",
  "CANCELLED",
  "REJECTED",
]);

export const refundApprovalStatusEnum = pgEnum("refund_approval_status", [
  "NOT_REQUIRED",
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export const webhookProcessingStatusEnum = pgEnum("webhook_processing_status", [
  "RECEIVED",
  "PROCESSING",
  "PROCESSED",
  "DUPLICATE",
  "INVALID",
  "FAILED",
]);

export const reconciliationStatusEnum = pgEnum("reconciliation_status", [
  "OPEN",
  "MATCHED",
  "MISMATCH",
  "RESOLVED",
  "FAILED",
]);

export const settlementStatusEnum = pgEnum("settlement_status", [
  "UNKNOWN",
  "PENDING",
  "SETTLED",
  "FAILED",
]);

export const providerEnvironmentEnum = pgEnum("provider_environment", ["sandbox", "production"]);

export const merchantConfigStatusEnum = pgEnum("merchant_config_status", [
  "active",
  "inactive",
  "pending_verification",
]);
