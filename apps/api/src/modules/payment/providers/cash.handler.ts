import type { PaymentStatus } from "../types.js";

export function createCashPaymentResult(params: {
  paymentId: string;
  amountMinor: number;
}) {
  return {
    providerPaymentId: `cash-${params.paymentId}`,
    providerReference: params.paymentId,
    normalizedStatus: "SUCCEEDED" as PaymentStatus,
    instructions: {
      type: "cash" as const,
      message: "Cash payment recorded",
    },
    rawResponse: { source: "offline_sync" },
  };
}
