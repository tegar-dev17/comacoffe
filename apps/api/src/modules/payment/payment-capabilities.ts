import type { Env } from "../../config/env.js";
import { devRoutesEnabled } from "../../config/runtime.js";

export function midtransConfigured(env: Env): boolean {
  return Boolean(env.MIDTRANS_SERVER_KEY?.trim());
}

export function xenditConfigured(env: Env): boolean {
  return Boolean(env.XENDIT_SECRET_KEY?.trim());
}

export function qrisDevMockEnabled(env: Env): boolean {
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
        ? "Isi MIDTRANS_SERVER_KEY di .env API (sandbox) untuk QRIS live, atau jalankan NODE_ENV=development tanpa key untuk mock dev."
        : "Isi XENDIT_SECRET_KEY di .env API untuk QRIS.";
  } else if (devMock) {
    qrisHint =
      "Mode QRIS mock (dev). Setelah checkout, selesaikan via POST /api/v1/dev/payments/:id/simulate-success.";
  }

  return {
    cash: true,
    qris: qrisLive || devMock,
    qrisDevMock: devMock,
    qrisProvider: env.PAYMENT_PROVIDER,
    qrisHint,
  };
}
