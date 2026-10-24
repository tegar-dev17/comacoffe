import type {
  CreatePaymentInput,
  ParsedWebhookEvent,
  ProviderCapabilities,
  ProviderCreatePaymentResult,
  ProviderRefundResult,
  ProviderStatusResult,
} from "../types.js";

export interface PaymentProviderAdapter {
  readonly name: "midtrans" | "xendit";
  capabilities(): ProviderCapabilities;
  createPayment(params: {
    paymentId: string;
    orderId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
    paymentMethod: CreatePaymentInput["paymentMethod"];
    metadata?: Record<string, unknown>;
    lineItems?: Array<{
      id: string;
      name: string;
      priceMinor: number;
      quantity: number;
    }>;
  }): Promise<ProviderCreatePaymentResult>;
  getPaymentStatus(params: {
    providerPaymentId?: string;
    providerReference: string;
  }): Promise<ProviderStatusResult>;
  cancelPayment(params: { providerReference: string }): Promise<ProviderStatusResult>;
  refundPayment(params: {
    providerReference: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  }): Promise<ProviderRefundResult>;
  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): boolean;
  parseWebhookEvent(body: unknown): ParsedWebhookEvent;
  normalizeProviderStatus(providerStatus: string): import("../types.js").PaymentStatus;
}
