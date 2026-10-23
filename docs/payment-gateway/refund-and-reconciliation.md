# Refund & Reconciliation

## Refund

- Endpoint: `POST /api/v1/payments/:id/refunds`
- Idempotency scope `payment.refund`
- Partial refund didukung jika provider mengizinkan (Midtrans); Xendit adapter menandai partial=false.
- Approval: refund > IDR 500.000 membutuhkan role supervisor/admin/owner.
- Status refund provider → `REFUND_PENDING` sampai konfirmasi.

## Reconciliation

Background/admin batch (`POST /api/v1/admin/reconciliation/run`):

- Target payment `PENDING` / `UNKNOWN` stale > 15 menit.
- Inquiry provider + catat `payment_reconciliations`.
- Tidak melakukan refund/debit otomatis saat mismatch — butuh tindakan manusia.

Exceptions: `GET /api/v1/admin/reconciliation/exceptions`.
