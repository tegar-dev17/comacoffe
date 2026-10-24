import { describe, expect, it } from "vitest";
import { XenditAdapter } from "./xendit.adapter.js";
import type { Env } from "../../../config/env.js";

const baseEnv = {
  NODE_ENV: "test",
  PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://x:x@localhost/x",
  JWT_SECRET: "x".repeat(32),
  PAYMENT_PROVIDER: "xendit",
  PAYMENT_ENV: "sandbox",
  XENDIT_SECRET_KEY: "xnd_development_test",
  XENDIT_WEBHOOK_TOKEN: "callback-token-test",
  XENDIT_API_BASE_URL: "https://api.xendit.co",
  MIDTRANS_API_BASE_URL: "https://api.sandbox.midtrans.com",
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: 10,
  WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
  RECONCILIATION_BATCH_SIZE: 50,
  LOG_LEVEL: "error",
} as Env;

describe("XenditAdapter", () => {
  const adapter = new XenditAdapter(baseEnv);

  it("verifies callback token header", () => {
    expect(
      adapter.verifyWebhook({ "x-callback-token": "callback-token-test" }, {}),
    ).toBe(true);
    expect(adapter.verifyWebhook({ "x-callback-token": "wrong" }, {})).toBe(false);
    expect(adapter.verifyWebhook({}, {})).toBe(false);
  });

  it("parses QR payment callback", () => {
    const parsed = adapter.parseWebhookEvent({
      event: "qr.payment",
      id: "evt-1",
      amount: 25000,
      created: "2026-01-01T00:00:00Z",
      status: "COMPLETED",
      qr_code: { id: "qr-1", external_id: "ORD-X-1" },
    });
    expect(parsed.normalizedStatus).toBe("SUCCEEDED");
    expect(parsed.providerReference).toBe("ORD-X-1");
    expect(parsed.amountMinor).toBe(25000);
  });
});
