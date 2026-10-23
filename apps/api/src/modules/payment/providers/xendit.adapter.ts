import type { Env } from "../../../config/env.js";
import type { PaymentStatus } from "../types.js";
import { ProviderCapabilityError } from "./midtrans.adapter.js";
import type { PaymentProviderAdapter } from "./interface.js";

interface XenditQrResponse {
  id: string;
  external_id: string;
  qr_string: string;
  amount: number;
  callback_url?: string;
  type: string;
  status?: string;
  expires_at?: string;
}

interface XenditQrPaymentCallback {
  event: string;
  id: string;
  amount: number;
  created: string;
  status: string;
  qr_code: {
    id: string;
    external_id: string;
  };
}

export class XenditAdapter implements PaymentProviderAdapter {
  readonly name = "xendit" as const;

  constructor(private readonly env: Env) {}

  capabilities() {
    return {
      qris: true,
      cancel: false,
      refund: true,
      partialRefund: false,
      inquiry: true,
    };
  }

  private authHeader(): string {
    const key = this.env.XENDIT_SECRET_KEY;
    if (!key) {
      throw new Error("XENDIT_SECRET_KEY is not configured");
    }
    return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
  }

  private baseUrl(): string {
    return this.env.XENDIT_API_BASE_URL.replace(/\/$/, "");
  }

  normalizeProviderStatus(providerStatus: string): PaymentStatus {
    const s = providerStatus.toUpperCase();
    switch (s) {
      case "COMPLETED":
      case "SUCCEEDED":
        return "SUCCEEDED";
      case "ACTIVE":
      case "PENDING":
        return "PENDING";
      case "EXPIRED":
        return "EXPIRED";
      case "FAILED":
        return "FAILED";
      default:
        return "UNKNOWN";
    }
  }

  async createPayment(params: {
    paymentId: string;
    orderReference: string;
    amountMinor: number;
    currency: string;
    paymentMethod: import("../types.js").PaymentMethod;
  }) {
    if (params.paymentMethod !== "qris") {
      throw new ProviderCapabilityError("Xendit adapter: only qris is supported in this integration");
    }
    if (params.currency !== "IDR") {
      throw new ProviderCapabilityError("Xendit QRIS integration expects IDR");
    }

    const callbackUrl = `${this.env.API_BASE_URL.replace(/\/$/, "")}/api/v1/webhooks/xendit/qris`;
    const form = new URLSearchParams({
      external_id: params.orderReference,
      type: "DYNAMIC",
      callback_url: callbackUrl,
      amount: String(params.amountMinor),
    });

    const res = await fetch(`${this.baseUrl()}/qr_codes`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const data = (await res.json()) as XenditQrResponse & { message?: string; error_code?: string };
    if (!res.ok) {
      throw new Error(`Xendit QR create failed: ${data.message ?? res.status}`);
    }

    const expiresAt = data.expires_at ? new Date(data.expires_at) : undefined;

    return {
      providerPaymentId: data.id,
      providerReference: data.external_id,
      normalizedStatus: "PENDING" as PaymentStatus,
      instructions: {
        type: "qris" as const,
        qrString: data.qr_string,
        expiresAt: expiresAt?.toISOString(),
      },
      rawResponse: data as unknown as Record<string, unknown>,
      expiresAt,
    };
  }

  async getPaymentStatus(params: { providerPaymentId?: string; providerReference: string }) {
    const id = params.providerPaymentId ?? params.providerReference;
    const res = await fetch(`${this.baseUrl()}/qr_codes/${encodeURIComponent(id)}`, {
      headers: { Authorization: this.authHeader() },
    });
    const data = (await res.json()) as XenditQrResponse & { message?: string };
    if (!res.ok) {
      throw new Error(`Xendit QR status failed: ${data.message ?? res.status}`);
    }
    const status = data.status ?? "ACTIVE";
    return {
      normalizedStatus: this.normalizeProviderStatus(status),
      providerStatus: status,
      amountMinor: data.amount,
      currency: "IDR",
      rawResponse: data as unknown as Record<string, unknown>,
    };
  }

  async cancelPayment(): Promise<never> {
    throw new ProviderCapabilityError("Xendit QRIS does not support cancel in this integration");
  }

  async refundPayment(params: {
    providerReference: string;
    amountMinor: number;
    reason: string;
    idempotencyKey: string;
  }) {
    const body = {
      external_id: params.providerReference,
      amount: params.amountMinor,
      reason: params.reason,
    };
    const res = await fetch(`${this.baseUrl()}/qr_codes/refunds`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        "Idempotency-Key": params.idempotencyKey,
      },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown> & { id?: string; status?: string };
    if (!res.ok) {
      throw new Error(`Xendit refund failed: ${JSON.stringify(data)}`);
    }
    return {
      providerRefundId: String(data.id ?? params.idempotencyKey),
      normalizedStatus: "PENDING" as const,
      rawResponse: data,
    };
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, body: unknown): boolean {
    void body;
    const token = this.env.XENDIT_WEBHOOK_TOKEN;
    if (!token) return false;
    const header = headers["x-callback-token"] ?? headers["X-CALLBACK-TOKEN"];
    const received = Array.isArray(header) ? header[0] : header;
    return received === token;
  }

  parseWebhookEvent(body: unknown): import("../types.js").ParsedWebhookEvent {
    const payload = body as XenditQrPaymentCallback;
    return {
      providerEventId: payload.id,
      providerPaymentId: payload.qr_code.id,
      providerReference: payload.qr_code.external_id,
      normalizedStatus: this.normalizeProviderStatus(payload.status),
      amountMinor: payload.amount,
      currency: "IDR",
      rawPayload: payload as unknown as Record<string, unknown>,
    };
  }
}
