import type { Env } from "../../config/env.js";
import { ProviderCapabilityError } from "./providers/midtrans.adapter.js";

/** When Midtrans production keys exist but QRIS channel is not activated yet (MAP). */
export function qrisStagingFallbackEnabled(env: Env): boolean {
  if (env.NODE_ENV === "production") return false;
  return env.ENABLE_QRIS_STAGING_FALLBACK === true;
}

export function isQrisChannelNotActivatedError(err: unknown): boolean {
  if (!(err instanceof ProviderCapabilityError)) return false;
  const msg = err.message.toLowerCase();
  return msg.includes("not activated") || msg.includes("payment channel");
}

export function qrCodeImageUrlFromString(qrString: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrString)}`;
}
