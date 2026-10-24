import type { PaymentStatus } from "../types.js";
import type { PaymentProviderAdapter } from "./interface.js";
import { ProviderCapabilityError } from "./midtrans.adapter.js";

/** Sandbox QRIS without real Midtrans credentials (development / test only). */
export class DevMidtransAdapter implements PaymentProviderAdapter {
  readonly name = "midtrans" as const;

  capabilities() {
    return {
      qris: true,
      cancel: false,
      refund: false,
      partialRefund: false,
      inquiry: false,
    };
  }

  async createPayment(params: {
    paymentId: string;
    orderId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
    paymentMethod: import("../types.js").CreatePaymentInput["paymentMethod"];
    metadata?: Record<string, unknown>;
  }) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    return {
      providerPaymentId: `dev-midtrans-${params.paymentId}`,
      providerReference: params.orderReference,
      normalizedStatus: "PENDING" as PaymentStatus,
      instructions: {
        type: "qris" as const,
        qrString: `000201DEVMOCK${params.orderReference.slice(0, 20)}`,
        message:
          "QRIS dev mock — gunakan POST /api/v1/dev/payments/:paymentId/simulate-success untuk menyelesaikan pembayaran.",
        expiresAt: expiresAt.toISOString(),
      },
      rawResponse: { source: "dev_midtrans_mock", amountMinor: params.amountMinor, currency: params.currency },
      expiresAt,
    };
  }

  async getPaymentStatus(): Promise<import("../types.js").ProviderStatusResult> {
    throw new ProviderCapabilityError("Dev mock does not support inquiry");
  }

  async cancelPayment(): Promise<import("../types.js").ProviderStatusResult> {
    throw new ProviderCapabilityError("Dev mock does not support cancel");
  }

  async refundPayment(): Promise<import("../types.js").ProviderRefundResult> {
    throw new ProviderCapabilityError("Dev mock does not support refund");
  }

  verifyWebhook() {
    return false;
  }

  parseWebhookEvent(): import("../types.js").ParsedWebhookEvent {
    throw new ProviderCapabilityError("Dev mock has no webhooks");
  }

  normalizeProviderStatus(providerStatus: string): PaymentStatus {
    if (providerStatus === "settlement") return "SUCCEEDED";
    if (providerStatus === "pending") return "PENDING";
    return "UNKNOWN";
  }
}
