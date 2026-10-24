import type { Env } from "../../../config/env.js";

export const MIDTRANS_SANDBOX_API_BASE = "https://api.sandbox.midtrans.com";
export const MIDTRANS_PRODUCTION_API_BASE = "https://api.midtrans.com";

export type MidtransEnvironment = "sandbox" | "production";

/** Prefer MIDTRANS_ENVIRONMENT; fall back to PAYMENT_ENV for backward compatibility. */
export function resolveMidtransEnvironment(env: Env): MidtransEnvironment {
  const raw = env.MIDTRANS_ENVIRONMENT ?? env.PAYMENT_ENV;
  return raw === "production" ? "production" : "sandbox";
}

export function resolveMidtransApiBaseUrl(
  env: Env,
  credentialOverride?: string | null,
): string {
  const override = credentialOverride?.trim();
  if (override) return override.replace(/\/$/, "");
  return resolveMidtransEnvironment(env) === "production"
    ? MIDTRANS_PRODUCTION_API_BASE
    : MIDTRANS_SANDBOX_API_BASE;
}

export function isMidtransSandboxServerKey(serverKey: string | undefined | null): boolean {
  return Boolean(serverKey?.trim().startsWith("SB-"));
}

export function isMidtransProductionServerKey(serverKey: string | undefined | null): boolean {
  const key = serverKey?.trim();
  if (!key) return false;
  return !isMidtransSandboxServerKey(key);
}

export function validateMidtransEnvironmentConfig(env: Env): void {
  if (env.PAYMENT_PROVIDER !== "midtrans") return;

  const target = resolveMidtransEnvironment(env);
  const key = env.MIDTRANS_SERVER_KEY?.trim();
  const base = resolveMidtransApiBaseUrl(env, env.MIDTRANS_API_BASE_URL);

  if (env.NODE_ENV === "production" && !key) {
    throw new Error("MIDTRANS_SERVER_KEY is required for production Midtrans QRIS");
  }

  if (target === "production") {
    if (key && isMidtransSandboxServerKey(key)) {
      throw new Error(
        "Sandbox Midtrans server key (SB-*) cannot be used when MIDTRANS_ENVIRONMENT=production",
      );
    }
    if (base.includes("sandbox")) {
      throw new Error(
        "MIDTRANS_API_BASE_URL must be https://api.midtrans.com when MIDTRANS_ENVIRONMENT=production",
      );
    }
    if (env.NODE_ENV === "production" && env.PAYMENT_ENV !== "production") {
      throw new Error("PAYMENT_ENV must be production when running production Midtrans QRIS");
    }
  }

  if (target === "sandbox" && key && isMidtransProductionServerKey(key) && base.includes("sandbox")) {
    // Allowed: production merchant testing against sandbox API is unusual; no hard fail.
  }
}

export function formatMidtransGrossAmount(amountMinor: number, currency: string): number | string {
  if (currency === "IDR") return amountMinor;
  return (amountMinor / 100).toFixed(2);
}
