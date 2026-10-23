import type { PaymentStatus } from "./types.js";

/** Stronger statuses should not be overwritten by weaker provider events without valid transitions. */
const STATUS_RANK: Record<PaymentStatus, number> = {
  CREATED: 0,
  PENDING: 1,
  UNKNOWN: 2,
  FAILED: 3,
  EXPIRED: 3,
  CANCELLED: 3,
  REFUND_PENDING: 4,
  SUCCEEDED: 5,
  PARTIALLY_REFUNDED: 6,
  REFUNDED: 7,
};

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  CREATED: ["PENDING", "SUCCEEDED", "FAILED", "CANCELLED", "UNKNOWN"],
  PENDING: ["SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED", "UNKNOWN", "REFUND_PENDING"],
  SUCCEEDED: ["REFUND_PENDING", "PARTIALLY_REFUNDED", "REFUNDED", "UNKNOWN"],
  FAILED: ["PENDING", "UNKNOWN"],
  EXPIRED: ["UNKNOWN"],
  CANCELLED: [],
  UNKNOWN: ["PENDING", "SUCCEEDED", "FAILED", "EXPIRED", "CANCELLED"],
  REFUND_PENDING: ["PARTIALLY_REFUNDED", "REFUNDED", "FAILED", "SUCCEEDED"],
  PARTIALLY_REFUNDED: ["REFUND_PENDING", "REFUNDED"],
  REFUNDED: [],
};

export function canTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  if (from === to) return true;
  const allowed = ALLOWED_TRANSITIONS[from];
  return allowed.includes(to);
}

/**
 * Returns the next status if transition is allowed; otherwise returns `from` (no-op).
 * Out-of-order weaker events are rejected when they would downgrade a stronger state.
 */
export function resolveTransition(
  from: PaymentStatus,
  to: PaymentStatus,
  options?: { force?: boolean },
): PaymentStatus {
  if (from === to) return from;
  if (!canTransition(from, to)) {
    return from;
  }
  if (!options?.force && STATUS_RANK[to] < STATUS_RANK[from] && to !== "UNKNOWN") {
    return from;
  }
  return to;
}

export function isTerminalStatus(status: PaymentStatus): boolean {
  return status === "REFUNDED" || status === "CANCELLED";
}

export function isPaidStatus(status: PaymentStatus): boolean {
  return (
    status === "SUCCEEDED" ||
    status === "PARTIALLY_REFUNDED" ||
    status === "REFUND_PENDING" ||
    status === "REFUNDED"
  );
}
