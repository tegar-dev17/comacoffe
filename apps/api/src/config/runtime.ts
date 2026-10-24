import type { Env } from "./env.js";
import { resolveMidtransApiBaseUrl, resolveMidtransEnvironment } from "../modules/payment/providers/midtrans-env.js";

/** Routes/tools that must never be exposed in production. */
export function isNonProductionAppEnv(env: Env): boolean {
  return env.NODE_ENV === "development" || env.NODE_ENV === "test";
}

export function devRoutesEnabled(env: Env): boolean {
  if (env.NODE_ENV === "production") return false;
  if (env.NODE_ENV === "test") return env.ENABLE_DEV_ROUTES === true;
  return env.NODE_ENV === "development";
}

const WEAK_JWT_SECRETS = new Set(
  [
    "change-me-in-production-min-32-chars-long",
    "dev-local-jwt-secret-key-32chars-min",
    "integration-test-secret-key-32chars",
    "x".repeat(32),
  ].map((s) => s.toLowerCase()),
);

export function validateProductionSecurity(env: Env): void {
  if (env.NODE_ENV !== "production") return;

  if (WEAK_JWT_SECRETS.has(env.JWT_SECRET.toLowerCase())) {
    throw new Error("JWT_SECRET is a known weak/placeholder value — set a strong secret for production");
  }

  if (env.PAYMENT_ENV !== "production") {
    throw new Error("PAYMENT_ENV must be production when NODE_ENV=production");
  }

  if (env.PAYMENT_PROVIDER === "midtrans" && resolveMidtransEnvironment(env) === "production") {
    const base = resolveMidtransApiBaseUrl(env, env.MIDTRANS_API_BASE_URL);
    if (base.includes("sandbox")) {
      throw new Error("Midtrans API base URL must not point to sandbox in production");
    }
  }
}
