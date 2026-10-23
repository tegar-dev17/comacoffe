# Provider Setup

## Midtrans (Core API — QRIS)

1. Daftar sandbox: [Midtrans Dashboard](https://dashboard.midtrans.com/).
2. Ambil **Server Key** & **Client Key** (Client Key hanya untuk frontend Snap jika nanti dipakai; modul ini tidak mengirim server key ke browser).
3. Set env:
   - `PAYMENT_PROVIDER=midtrans`
   - `PAYMENT_ENV=sandbox`
   - `MIDTRANS_SERVER_KEY=SB-Mid-server-...`
   - `MIDTRANS_API_BASE_URL=https://api.sandbox.midtrans.com`
4. Webhook URL (Notification URL): `https://<host>/api/v1/webhooks/midtrans/notification`
5. Uji QRIS via [simulator sandbox](https://simulator.sandbox.midtrans.com/openapi/qris/index).

Produk: **Core API** `POST /v2/charge` dengan `payment_type: qris` (bukan campuran Snap/BI-SNAP).

## Xendit (QR Codes API)

1. Ambil secret key development dari dashboard Xendit.
2. Set env:
   - `PAYMENT_PROVIDER=xendit`
   - `XENDIT_SECRET_KEY=xnd_development_...`
   - `XENDIT_WEBHOOK_TOKEN=<verification token dari dashboard>`
3. Webhook type `qr_code`: `https://<host>/api/v1/webhooks/xendit/qris`
4. Validasi header `x-callback-token`.

## Cash / offline

`paymentMethod=cash` membuat provider internal `cash` — cocok untuk sinkronisasi offline-first dengan `localOperationId` + idempotency key per operasi terminal.
