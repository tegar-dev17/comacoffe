# Webhook Security

## Verified implementation (code)

| Provider | Verification | Dedupe |
| --- | --- | --- |
| Midtrans | SHA-512 over `order_id` + `status_code` + `gross_amount` + **server key** (tenant runtime config when payment is known) | Unique `(provider, provider_event_id)` |
| Xendit QR | `x-callback-token` header vs configured webhook token | Same dedupe index |

Additional checks before mutating payments:

- Amount and currency must match the internal payment row (otherwise reconciliation `MISMATCH`, webhook marked failed).
- `provider_reference` and `provider_payment_id` must match stored values when both sides are present.

HTTP:

- Invalid signature → **401** (Midtrans plain text, Xendit JSON error).
- Per-route rate limit: `WEBHOOK_RATE_LIMIT_PER_MINUTE` (default 120/min per IP).

## Assumptions (not independently audited against provider docs in CI)

- Midtrans notification field names match Core API notification samples used in adapter tests.
- Xendit QR callback shape matches `XenditQrPaymentCallback` in the adapter.

## Midtrans

- Verifikasi `signature_key` = SHA512(`order_id` + `status_code` + `gross_amount` + ServerKey).
- Tolak payload tanpa signature valid (401).
- Simpan event ke `payment_webhook_events` sebelum mutasi bisnis.
- Deduplikasi `provider + provider_event_id` (unique index).
- Validasi amount/currency terhadap payment record — mismatch → reconciliation exception, bukan `SUCCEEDED`.

## Xendit

- Bandingkan header `x-callback-token` dengan `XENDIT_WEBHOOK_TOKEN`.
- Respons 200 segera setelah event durable tersimpan.
- Deduplikasi via `id` event (`qr.payment`).

## General

- Tanpa session browser.
- Body size limit 256KB.
- Header sensitif di-redact di log/DB.
- IP allowlist **bukan** satu-satunya kontrol.
