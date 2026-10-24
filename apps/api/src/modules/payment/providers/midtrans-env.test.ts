import { describe, expect, it } from "vitest";
import type { Env } from "../../../config/env.js";
import {
  MIDTRANS_PRODUCTION_API_BASE,
  MIDTRANS_SANDBOX_API_BASE,
  resolveMidtransApiBaseUrl,
  resolveMidtransEnvironment,
  validateMidtransEnvironmentConfig,
} from "./midtrans-env.js";

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

describe("midtrans-env", () => {
  it("defaults to sandbox API base", () => {
    expect(resolveMidtransEnvironment({ ...base, PAYMENT_ENV: "sandbox" })).toBe("sandbox");
    expect(resolveMidtransApiBaseUrl(base)).toBe(MIDTRANS_SANDBOX_API_BASE);
  });

  it("selects production API when MIDTRANS_ENVIRONMENT=production", () => {
    const env = {
      ...base,
      MIDTRANS_ENVIRONMENT: "production",
      PAYMENT_ENV: "sandbox",
      MIDTRANS_SERVER_KEY: "Mid-server-prod-key",
    } as Env;
    expect(resolveMidtransEnvironment(env)).toBe("production");
    expect(resolveMidtransApiBaseUrl(env)).toBe(MIDTRANS_PRODUCTION_API_BASE);
  });

  it("rejects sandbox key with production environment", () => {
    expect(() =>
      validateMidtransEnvironmentConfig({
        ...base,
        MIDTRANS_ENVIRONMENT: "production",
        MIDTRANS_SERVER_KEY: "SB-Mid-server-test",
      } as Env),
    ).toThrow(/Sandbox Midtrans server key/);
  });

  it("rejects sandbox API URL with production environment", () => {
    expect(() =>
      validateMidtransEnvironmentConfig({
        ...base,
        MIDTRANS_ENVIRONMENT: "production",
        MIDTRANS_SERVER_KEY: "Mid-server-prod-key",
        MIDTRANS_API_BASE_URL: MIDTRANS_SANDBOX_API_BASE,
      } as Env),
    ).toThrow(/api.midtrans.com/);
  });
});
