import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../../../config/env.js";
import { MidtransAdapter, classifyMidtransChargeFailure } from "./midtrans.adapter.js";
import { ProviderCapabilityError } from "./midtrans.adapter.js";
import { MIDTRANS_PRODUCTION_API_BASE } from "./midtrans-env.js";

const prodEnv = {
  NODE_ENV: "test",
  PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://x:x@localhost/x",
  JWT_SECRET: "x".repeat(32),
  PAYMENT_PROVIDER: "midtrans",
  PAYMENT_ENV: "production",
  MIDTRANS_ENVIRONMENT: "production",
  MIDTRANS_SERVER_KEY: "Mid-server-prod-test-key",
  XENDIT_API_BASE_URL: "https://api.xendit.co",
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: 10,
  WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
  RECONCILIATION_BATCH_SIZE: 50,
  LOG_LEVEL: "error",
  MIDTRANS_QRIS_ACQUIRER: "gopay",
} as Env;

describe("MidtransAdapter charge", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts to production /v2/charge and returns PENDING with qr image URL", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status_code: "201",
        status_message: "Success",
        transaction_id: "tx-prod-1",
        order_id: "ORD-REF-1",
        gross_amount: "28000.00",
        payment_type: "qris",
        transaction_status: "pending",
        actions: [
          {
            name: "generate-qr-code",
            method: "GET",
            url: "https://api.midtrans.com/v2/qris/qr-code/abc",
          },
        ],
        expiry_time: "2026-10-24 12:00:00 +0700",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new MidtransAdapter(prodEnv);
    const result = await adapter.createPayment({
      paymentId: "pay-1",
      orderId: "ord-1",
      orderReference: "ORD-REF-1",
      amountMinor: 28000,
      currency: "IDR",
      paymentMethod: "qris",
      lineItems: [{ id: "p1", name: "Cappuccino", priceMinor: 28000, quantity: 1 }],
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${MIDTRANS_PRODUCTION_API_BASE}/v2/charge`);
    const sent = JSON.parse(String(init.body)) as {
      payment_type: string;
      qris: { acquirer: string };
      item_details: unknown[];
    };
    expect(sent.payment_type).toBe("qris");
    expect(sent.qris.acquirer).toBe("gopay");
    expect(sent.item_details).toHaveLength(1);

    expect(result.normalizedStatus).toBe("PENDING");
    expect(result.instructions.qrCodeUrl).toContain("qr-code");
    expect(result.providerPaymentId).toBe("tx-prod-1");
  });

  it("throws capability error when QR action is missing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          status_code: "201",
          transaction_id: "tx-2",
          order_id: "ORD-2",
          transaction_status: "pending",
          actions: [],
        }),
      }),
    );

    const adapter = new MidtransAdapter(prodEnv);
    await expect(
      adapter.createPayment({
        paymentId: "p",
        orderId: "o",
        orderReference: "ORD-2",
        amountMinor: 1000,
        currency: "IDR",
        paymentMethod: "qris",
      }),
    ).rejects.toBeInstanceOf(ProviderCapabilityError);
  });

  it("maps acquirer configuration errors", () => {
    const err = classifyMidtransChargeFailure(
      { status_message: "Payment channel qris is not enabled", status_code: "402" } as never,
      402,
    );
    expect(err).toBeInstanceOf(ProviderCapabilityError);
  });
});
