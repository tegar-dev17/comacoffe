# Webhook Security

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
