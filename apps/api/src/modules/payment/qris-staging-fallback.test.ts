import { describe, expect, it } from "vitest";
import { ProviderCapabilityError } from "./providers/midtrans.adapter.js";
import {
  isQrisChannelNotActivatedError,
  qrisStagingFallbackEnabled,
  qrCodeImageUrlFromString,
} from "./qris-staging-fallback.js";

describe("qris staging fallback", () => {
  it("detects inactive channel errors", () => {
    expect(
      isQrisChannelNotActivatedError(
        new ProviderCapabilityError("Midtrans QRIS is not activated: Payment channel is not activated."),
      ),
    ).toBe(true);
    expect(isQrisChannelNotActivatedError(new Error("other"))).toBe(false);
  });

  it("is disabled in production NODE_ENV", () => {
    expect(
      qrisStagingFallbackEnabled({
        NODE_ENV: "production",
        ENABLE_QRIS_STAGING_FALLBACK: true,
      } as never),
    ).toBe(false);
  });

  it("builds qr image url", () => {
    expect(qrCodeImageUrlFromString("abc")).toContain(encodeURIComponent("abc"));
  });
});
