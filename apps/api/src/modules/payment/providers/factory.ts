import type { Env } from "../../../config/env.js";
import type { PaymentProvider } from "../types.js";
import type { PaymentProviderAdapter } from "./interface.js";
import { MidtransAdapter } from "./midtrans.adapter.js";
import { XenditAdapter } from "./xendit.adapter.js";
import type { ProviderRuntimeConfig } from "./runtime-config.js";
import { fallbackRuntimeFromEnv } from "./runtime-config.js";

export function createProviderAdapter(
  env: Env,
  provider?: PaymentProvider,
  runtime?: ProviderRuntimeConfig,
): PaymentProviderAdapter | null {
  const selected = provider ?? env.PAYMENT_PROVIDER;
  if (selected === "cash") return null;
  const resolvedRuntime = runtime ?? fallbackRuntimeFromEnv(env, selected);
  if (selected === "midtrans") return new MidtransAdapter(env, resolvedRuntime);
  if (selected === "xendit") return new XenditAdapter(env, resolvedRuntime);
  throw new Error(`Unknown payment provider: ${selected}`);
}
