export type PaymentStatus =
  | "CREATED"
  | "PENDING"
  | "SUCCEEDED"
  | "FAILED"
  | "EXPIRED"
  | "CANCELLED"
  | "UNKNOWN"
  | "REFUND_PENDING"
  | "PARTIALLY_REFUNDED"
  | "REFUNDED";

export type PaymentProvider = "midtrans" | "xendit" | "cash";

export type PaymentMethod = "qris" | "cash" | "card" | "ewallet" | "other";

export interface CreatePaymentInput {
  orderId: string;
  paymentMethod: PaymentMethod;
  idempotencyKey: string;
  provider?: PaymentProvider;
  localOperationId?: string;
  deviceId?: string;
}

export interface PaymentInstructions {
  type: "qris" | "cash" | "redirect" | "none";
  qrCodeUrl?: string;
  qrString?: string;
  expiresAt?: string;
  message?: string;
}

export interface ProviderCreatePaymentResult {
  providerPaymentId: string;
  providerReference: string;
  normalizedStatus: PaymentStatus;
  instructions: PaymentInstructions;
  rawResponse: Record<string, unknown>;
  expiresAt?: Date;
}

export interface ProviderStatusResult {
  normalizedStatus: PaymentStatus;
  providerStatus: string;
  amountMinor?: number;
  currency?: string;
  rawResponse: Record<string, unknown>;
}

export interface ProviderRefundResult {
  providerRefundId: string;
  normalizedStatus: "PENDING" | "SUCCEEDED" | "FAILED";
  rawResponse: Record<string, unknown>;
}

export interface ParsedWebhookEvent {
  providerEventId: string;
  providerPaymentId: string;
  providerReference?: string;
  normalizedStatus: PaymentStatus;
  amountMinor?: number;
  currency?: string;
  rawPayload: Record<string, unknown>;
}

export interface ProviderCapabilities {
  qris: boolean;
  cancel: boolean;
  refund: boolean;
  partialRefund: boolean;
  inquiry: boolean;
}
