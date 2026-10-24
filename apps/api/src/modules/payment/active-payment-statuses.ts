import type { PaymentStatus } from "./types.js";

/**
 * Payment statuses that block creating another payment for the same order
 * while the order is still awaiting payment (pending_payment / draft).
 *
 * Terminal or settled paths (SUCCEEDED, FAILED, EXPIRED, CANCELLED, REFUNDED, …)
 * do not block a new payment attempt.
 */
export const ACTIVE_PAYMENT_STATUSES = [
  "CREATED",
  "PENDING",
  "UNKNOWN",
] as const satisfies readonly PaymentStatus[];

export type ActivePaymentStatus = (typeof ACTIVE_PAYMENT_STATUSES)[number];

export function isActivePaymentStatus(status: PaymentStatus): status is ActivePaymentStatus {
  return (ACTIVE_PAYMENT_STATUSES as readonly PaymentStatus[]).includes(status);
}

export const DUPLICATE_ACTIVE_PAYMENT_MESSAGE =
  "Order already has an active payment in progress";
