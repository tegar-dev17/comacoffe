import { describe, expect, it } from "vitest";
import { devRoutesEnabled, validateProductionSecurity } from "./runtime.js";
import type { Env } from "./env.js";

const baseEnv = {
  NODE_ENV: "production",
  PORT: 3001,
  API_BASE_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://x:x@localhost/x",
  JWT_SECRET: "super-production-secret-value-32chars-minimum",
  PAYMENT_PROVIDER: "midtrans",
  PAYMENT_ENV: "production",
  MIDTRANS_SERVER_KEY: "prod-key",
  MIDTRANS_API_BASE_URL: "https://api.midtrans.com",
  XENDIT_API_BASE_URL: "https://api.xendit.co",
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: 10,
  WEBHOOK_RATE_LIMIT_PER_MINUTE: 120,
  RECONCILIATION_BATCH_SIZE: 50,
  LOG_LEVEL: "error",
  ENABLE_DEV_ROUTES: false,
  REFUND_APPROVAL_THRESHOLD_MINOR: 500_000,
  RECONCILIATION_INTERVAL_MS: 60_000,
  RECONCILIATION_STALE_MINUTES: 15,
  OUTBOX_INTERVAL_MS: 5000,
  OUTBOX_MAX_ATTEMPTS: 8,
  ENABLE_RLS: false,
  MIDTRANS_QRIS_ACQUIRER: "gopay",
} satisfies Env;

describe("runtime security", () => {
  it("disables dev routes in production", () => {
    expect(devRoutesEnabled(baseEnv)).toBe(false);
  });

  it("allows dev routes only in development", () => {
    expect(devRoutesEnabled({ ...baseEnv, NODE_ENV: "development" })).toBe(true);
  });

  it("requires explicit flag for dev routes in test env", () => {
    expect(devRoutesEnabled({ ...baseEnv, NODE_ENV: "test", ENABLE_DEV_ROUTES: false })).toBe(
      false,
    );
    expect(devRoutesEnabled({ ...baseEnv, NODE_ENV: "test", ENABLE_DEV_ROUTES: true })).toBe(true);
  });

  it("rejects weak JWT secret in production", () => {
    expect(() =>
      validateProductionSecurity({
        ...baseEnv,
        JWT_SECRET: "change-me-in-production-min-32-chars-long",
      }),
    ).toThrow(/JWT_SECRET/);
  });

  it("rejects sandbox payment env in production app env", () => {
    expect(() =>
      validateProductionSecurity({
        ...baseEnv,
        PAYMENT_ENV: "sandbox",
      }),
    ).toThrow(/PAYMENT_ENV/);
  });
});
