import type { Env } from "../../../config/env.js";
import type { PaymentProvider } from "../types.js";
import type { PaymentProviderAdapter } from "./interface.js";
import { MidtransAdapter } from "./midtrans.adapter.js";
import { XenditAdapter } from "./xendit.adapter.js";

export function createProviderAdapter(
  env: Env,
  provider?: PaymentProvider,
): PaymentProviderAdapter | null {
  const selected = provider ?? env.PAYMENT_PROVIDER;
  if (selected === "cash") return null;
  if (selected === "midtrans") return new MidtransAdapter(env);
  if (selected === "xendit") return new XenditAdapter(env);
  throw new Error(`Unknown payment provider: ${selected}`);
}
