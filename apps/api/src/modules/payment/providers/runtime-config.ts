import type { Env } from "../../../config/env.js";
import type { ResolvedProviderCredentials } from "../credentials/types.js";
import type { PaymentProvider } from "../types.js";
import { resolveMidtransApiBaseUrl } from "./midtrans-env.js";

export interface ProviderRuntimeConfig {
  provider: PaymentProvider;
  environment: "sandbox" | "production";
  credentials: ResolvedProviderCredentials;
}

export function fallbackRuntimeFromEnv(env: Env, provider: PaymentProvider): ProviderRuntimeConfig {
  if (provider === "midtrans") {
    return {
      provider,
      environment: env.PAYMENT_ENV,
      credentials: {
        serverKey: env.MIDTRANS_SERVER_KEY,
        clientKey: env.MIDTRANS_CLIENT_KEY,
        apiBaseUrl: env.MIDTRANS_API_BASE_URL ?? resolveMidtransApiBaseUrl(env),
      },
    };
  }
  return {
    provider,
    environment: env.PAYMENT_ENV,
    credentials: {
      serverKey: env.XENDIT_SECRET_KEY,
      webhookToken: env.XENDIT_WEBHOOK_TOKEN,
      apiBaseUrl: env.XENDIT_API_BASE_URL,
    },
  };
}
