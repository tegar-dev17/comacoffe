import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { MidtransAdapter } from "./midtrans.adapter.js";
import type { Env } from "../../../config/env.js";

const baseEnv = {
  NODE_ENV: "test",
  PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://x:x@localhost/x",
  JWT_SECRET: "x".repeat(32),
  PAYMENT_PROVIDER: "midtrans",
  PAYMENT_ENV: "sandbox",
  MIDTRANS_SERVER_KEY: "SB-Mid-server-test-key",
  MIDTRANS_API_BASE_URL: "https://api.sandbox.midtrans.com",
  XENDIT_API_BASE_URL: "https://api.xendit.co",
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: 10,
  WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
  RECONCILIATION_BATCH_SIZE: 50,
  LOG_LEVEL: "error",
} as Env;

describe("MidtransAdapter", () => {
  const adapter = new MidtransAdapter(baseEnv);

  it("maps provider statuses", () => {
    expect(adapter.normalizeProviderStatus("settlement")).toBe("SUCCEEDED");
    expect(adapter.normalizeProviderStatus("pending")).toBe("PENDING");
    expect(adapter.normalizeProviderStatus("expire")).toBe("EXPIRED");
    expect(adapter.normalizeProviderStatus("weird")).toBe("UNKNOWN");
  });

  it("verifies notification signature", () => {
    const body = {
      order_id: "ORD-1",
      status_code: "200",
      gross_amount: "10000.00",
      transaction_status: "settlement",
      transaction_id: "tx-1",
    };
    const signature = createHash("sha512")
      .update(`${body.order_id}${body.status_code}${body.gross_amount}${baseEnv.MIDTRANS_SERVER_KEY}`)
      .digest("hex");
    const valid = adapter.verifyWebhook({}, { ...body, signature_key: signature });
    expect(valid).toBe(true);
    expect(adapter.verifyWebhook({}, { ...body, signature_key: "invalid" })).toBe(false);
  });

  it("parses webhook event", () => {
    const parsed = adapter.parseWebhookEvent({
      order_id: "ORD-1",
      status_code: "200",
      gross_amount: "15000.00",
      transaction_status: "settlement",
      transaction_id: "tx-99",
    });
    expect(parsed.normalizedStatus).toBe("SUCCEEDED");
    expect(parsed.amountMinor).toBe(15000);
    expect(parsed.providerReference).toBe("ORD-1");
  });
});
