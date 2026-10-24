import type { Env } from "../../config/env.js";
import { devRoutesEnabled } from "../../config/runtime.js";
import {
  isMidtransProductionServerKey,
  isMidtransSandboxServerKey,
  resolveMidtransEnvironment,
} from "./providers/midtrans-env.js";

export function midtransConfigured(env: Env): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY?.trim());
}

export function xenditConfigured(env: Env): boolean {
  return Boolean(env.XENDIT_SECRET_KEY?.trim());
}

export function qrisDevMockEnabled(env: Env): boolean {
  if (env.NODE_ENV === "production") return false;
  return devRoutesEnabled(env) && env.PAYMENT_PROVIDER === "midtrans" && !midtransConfigured(env);
}

export function resolvePosPaymentCapabilities(env: Env) {
  const devMock = qrisDevMockEnabled(env);
  const qrisLive =
    (env.PAYMENT_PROVIDER === "midtrans" && midtransConfigured(env)) ||
    (env.PAYMENT_PROVIDER === "xendit" && xenditConfigured(env));

  let qrisHint: string | undefined;
  if (!qrisLive && !devMock) {
    qrisHint =
      env.PAYMENT_PROVIDER === "midtrans"
        ? "Production QRIS: set MIDTRANS_SERVER_KEY (production) and MIDTRANS_ENVIRONMENT=production on the API server. Cash checkout works without Midtrans."
        : "Isi XENDIT_SECRET_KEY di .env API untuk QRIS.";
  } else if (devMock) {
    qrisHint =
      "Mode QRIS mock (dev). Setelah checkout, selesaikan via POST /api/v1/dev/payments/:id/simulate-success.";
  }

  const midtransEnv =
    env.PAYMENT_PROVIDER === "midtrans" ? resolveMidtransEnvironment(env) : undefined;

  return {
    cash: true,
    qris: qrisLive || devMock,
    qrisDevMock: devMock,
    qrisProvider: env.PAYMENT_PROVIDER,
    qrisHint,
    midtransEnvironment: midtransEnv,
    midtransProductionReady:
      env.PAYMENT_PROVIDER === "midtrans" &&
      midtransConfigured(env) &&
      resolveMidtransEnvironment(env) === "production" &&
      isMidtransProductionServerKey(env.MIDTRANS_SERVER_KEY),
    midtransSandboxReady:
      env.PAYMENT_PROVIDER === "midtrans" &&
      midtransConfigured(env) &&
      resolveMidtransEnvironment(env) === "sandbox" &&
      isMidtransSandboxServerKey(env.MIDTRANS_SERVER_KEY),
  };
}
