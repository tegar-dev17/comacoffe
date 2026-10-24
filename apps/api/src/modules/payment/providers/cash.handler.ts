import type { PaymentStatus } from "../types.js";

export function createCashPaymentResult(params: {
  paymentId: string;
  amountMinor: number;
  cashAmountReceivedMinor?: number;
}) {
  const received = params.cashAmountReceivedMinor ?? params.amountMinor;
  const changeMinor = Math.max(0, received - params.amountMinor);
  return {
    providerPaymentId: `cash-${params.paymentId}`,
    providerReference: params.paymentId,
    normalizedStatus: "SUCCEEDED" as PaymentStatus,
    instructions: {
      type: "cash" as const,
      message: "Cash payment recorded",
      cashAmountReceivedMinor: received,
      changeMinor,
    },
    rawResponse: { source: "offline_sync", cashAmountReceivedMinor: received, changeMinor },
  };
}
