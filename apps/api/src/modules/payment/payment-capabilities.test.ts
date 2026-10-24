import { describe, expect, it } from "vitest";
import type { Env } from "../../config/env.js";
import { qrisDevMockEnabled, resolvePosPaymentCapabilities } from "./payment-capabilities.js";

const base = {
  NODE_ENV: "development",
  PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://x:x@localhost/x",
  JWT_SECRET: "x".repeat(32),
  PAYMENT_PROVIDER: "midtrans",
  PAYMENT_ENV: "sandbox",
  XENDIT_API_BASE_URL: "https://api.xendit.co",
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: 10,
  WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
  RECONCILIATION_BATCH_SIZE: 50,
  LOG_LEVEL: "error",
  MIDTRANS_QRIS_ACQUIRER: "gopay",
} as Env;

describe("payment capabilities", () => {
  it("never enables dev mock in production NODE_ENV", () => {
    expect(
      qrisDevMockEnabled({
        ...base,
        NODE_ENV: "production",
        PAYMENT_ENV: "production",
        MIDTRANS_ENVIRONMENT: "production",
      } as Env),
    ).toBe(false);
  });

  it("reports production readiness without exposing secrets", () => {
    const caps = resolvePosPaymentCapabilities({
      ...base,
      MIDTRANS_ENVIRONMENT: "production",
      PAYMENT_ENV: "production",
      MIDTRANS_SERVER_KEY: "Mid-server-prod-key",
    } as Env);
    expect(caps.midtransProductionReady).toBe(true);
    expect(JSON.stringify(caps)).not.toContain("Mid-server-prod-key");
  });
});
