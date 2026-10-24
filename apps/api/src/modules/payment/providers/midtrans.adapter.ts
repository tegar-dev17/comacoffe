import { createHash } from "node:crypto";
import type { Env } from "../../../config/env.js";
import type { PaymentStatus } from "../types.js";
import type { PaymentProviderAdapter } from "./interface.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";

interface MidtransChargeResponse {
  status_code: string;
  status_message: string;
  transaction_id: string;
  order_id: string;
  gross_amount: string;
  currency?: string;
  payment_type: string;
  transaction_status: string;
  fraud_status?: string;
  actions?: Array<{ name: string; method: string; url: string }>;
  qr_string?: string;
  expiry_time?: string;
}

interface MidtransNotification {
  order_id: string;
  status_code: string;
  gross_amount: string;
  transaction_status: string;
  transaction_id: string;
  signature_key?: string;
  fraud_status?: string;
  payment_type?: string;
}

export class MidtransAdapter implements PaymentProviderAdapter {
  readonly name = "midtrans" as const;

  constructor(
    private readonly env: Env,
    private readonly runtime?: ProviderRuntimeConfig,
  ) {}

  capabilities() {
    return {
      qris: true,
      cancel: true,
      refund: true,
      partialRefund: true,
      inquiry: true,
    };
  }

  private serverKey(): string {
    const key = this.runtime?.credentials.serverKey ?? this.env.MIDTRANS_SERVER_KEY;
    if (!key) {
      throw new ProviderCapabilityError(
        "Midtrans server key is not configured — set MIDTRANS_SERVER_KEY or use Bayar Tunai",
      );
    }
    return key;
  }

  private authHeader(): string {
    return `Basic ${Buffer.from(`${this.serverKey()}:`).toString("base64")}`;
  }

  private baseUrl(): string {
    const base = this.runtime?.credentials.apiBaseUrl ?? this.env.MIDTRANS_API_BASE_URL;
    return base.replace(/\/$/, "");
  }

  normalizeProviderStatus(providerStatus: string): PaymentStatus {
    const s = providerStatus.toLowerCase();
    switch (s) {
      case "capture":
      case "settlement":
        return "SUCCEEDED";
      case "pending":
        return "PENDING";
      case "deny":
      case "failure":
        return "FAILED";
      case "expire":
        return "EXPIRED";
      case "cancel":
        return "CANCELLED";
      case "refund":
        return "REFUNDED";
      case "partial_refund":
        return "PARTIALLY_REFUNDED";
      case "authorize":
        return "PENDING";
      default:
        return "UNKNOWN";
    }
  }

  async createPayment(params: {
    paymentId: string;
    orderId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
    paymentMethod: import("../types.js").PaymentMethod;
  }) {
    if (params.paymentMethod !== "qris") {
      throw new ProviderCapabilityError("Midtrans adapter: only qris is supported in this integration");
    }
    const grossAmount = params.amountMinor;
    const body = {
      payment_type: "qris",
      transaction_details: {
        order_id: params.orderReference,
        gross_amount: grossAmount,
      },
      qris: { acquirer: "gopay" },
    };

    const res = await fetch(`${this.baseUrl()}/v2/charge`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: this.authHeader(),
      },
      body: JSON.stringify(body),
    });

    const data = (await res.json()) as MidtransChargeResponse & { error_messages?: string[] };
    if (!res.ok || data.status_code !== "201") {
      const msg = data.status_message ?? data.error_messages?.join(", ") ?? "Midtrans charge failed";
      throw new Error(`Midtrans charge error: ${msg}`);
    }

    const qrAction =
      data.actions?.find((a) => a.name === "generate-qr-code") ??
      data.actions?.find((a) => a.name === "generate-qr-code-v2");

    const expiresAt = data.expiry_time ? new Date(data.expiry_time) : undefined;

    return {
      providerPaymentId: data.transaction_id,
      providerReference: data.order_id,
      normalizedStatus: this.normalizeProviderStatus(data.transaction_status),
      instructions: {
        type: "qris" as const,
        qrCodeUrl: qrAction?.url,
        qrString: data.qr_string,
        expiresAt: expiresAt?.toISOString(),
      },
      rawResponse: data as unknown as Record<string, unknown>,
      expiresAt,
    };
  }

  async getPaymentStatus(params: { providerReference: string }) {
    const res = await fetch(
      `${this.baseUrl()}/v2/${encodeURIComponent(params.providerReference)}/status`,
      {
        headers: { Accept: "application/json", Authorization: this.authHeader() },
      },
    );
    const data = (await res.json()) as MidtransChargeResponse;
    if (!res.ok) {
      throw new Error(`Midtrans status inquiry failed: ${data.status_message ?? res.status}`);
    }
    const amountMinor = Math.round(parseFloat(data.gross_amount));
    return {
      normalizedStatus: this.normalizeProviderStatus(data.transaction_status),
      providerStatus: data.transaction_status,
      amountMinor,
      currency: data.currency ?? "IDR",
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async cancelPayment(params: { providerReference: string }) {
    const res = await fetch(
      `${this.baseUrl()}/v2/${encodeURIComponent(params.providerReference)}/cancel`,
      {
        method: "POST",
        headers: { Accept: "application/json", Authorization: this.authHeader() },
      },
    );
    const data = (await res.json()) as MidtransChargeResponse;
    if (!res.ok) {
      throw new Error(`Midtrans cancel failed: ${data.status_message ?? res.status}`);
    }
    return {
      normalizedStatus: this.normalizeProviderStatus(data.transaction_status),
      providerStatus: data.transaction_status,
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async refundPayment(params: {
    providerReference: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  }) {
    const body = {
      refund_key: params.idempotencyKey,
      amount: params.amountMinor,
      reason: params.reason,
    };
    const res = await fetch(
      `${this.baseUrl()}/v2/${encodeURIComponent(params.providerReference)}/refund`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Authorization: this.authHeader(),
        },
        body: JSON.stringify(body),
      },
    );
    const data = (await res.json()) as Record<string, unknown> & {
      status_code?: string;
      status_message?: string;
      refund_chargeback_id?: number;
      transaction_status?: string;
    };
    if (!res.ok) {
      throw new Error(`Midtrans refund failed: ${String(data.status_message ?? res.status)}`);
    }
    const txStatus = String(data.transaction_status ?? "refund");
    const normalized =
      txStatus === "partial_refund" ? ("PENDING" as const) : ("PENDING" as const);
    return {
      providerRefundId: String(data.refund_chargeback_id ?? params.idempotencyKey),
      normalizedStatus: normalized,
      rawResponse: data,
    };
  }

  verifyWebhook(_headers: Record<string, string | string[] | undefined>, body: unknown): boolean {
    const notification = body as MidtransNotification;
    let serverKey: string;
    try {
      serverKey = this.serverKey();
    } catch {
      return false;
    }
    if (!notification.signature_key) return false;
    const expected = createHash("sha512")
      .update(
        `${notification.order_id}${notification.status_code}${notification.gross_amount}${serverKey}`,
      )
      .digest("hex");
    return expected === notification.signature_key;
  }

  parseWebhookEvent(body: unknown): import("../types.js").ParsedWebhookEvent {
    const n = body as MidtransNotification;
    const amountMinor = Math.round(parseFloat(n.gross_amount));
    return {
      providerEventId: `${n.transaction_id}:${n.transaction_status}:${n.status_code}`,
      providerPaymentId: n.transaction_id,
      providerReference: n.order_id,
      normalizedStatus: this.normalizeProviderStatus(n.transaction_status),
      amountMinor,
      currency: "IDR",
      rawPayload: n as unknown as Record<string, unknown>,
    };
  }
}

export class ProviderCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderCapabilityError";
  }
}
