import { describe, expect, it } from "vitest";
import { ACTIVE_PAYMENT_STATUSES, isActivePaymentStatus } from "./active-payment-statuses.js";

describe("active payment statuses", () => {
  it("treats in-flight statuses as active", () => {
    for (const s of ACTIVE_PAYMENT_STATUSES) {
      expect(isActivePaymentStatus(s)).toBe(true);
    }
  });

  it("does not treat terminal statuses as active", () => {
    expect(isActivePaymentStatus("SUCCEEDED")).toBe(false);
    expect(isActivePaymentStatus("FAILED")).toBe(false);
    expect(isActivePaymentStatus("EXPIRED")).toBe(false);
    expect(isActivePaymentStatus("CANCELLED")).toBe(false);
    expect(isActivePaymentStatus("REFUNDED")).toBe(false);
  });
});
