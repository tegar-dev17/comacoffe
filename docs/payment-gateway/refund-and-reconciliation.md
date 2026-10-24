# Refund & Reconciliation

## Refund

- Endpoint: `POST /api/v1/payments/:id/refunds`
- Idempotency scope `payment.refund`
- Partial refund didukung jika provider mengizinkan (Midtrans); Xendit adapter menandai partial=false.
- Approval: refund > IDR 500.000 membutuhkan role supervisor/admin/owner.
- Status refund provider → `REFUND_PENDING` sampai konfirmasi.

### Verified

- Refund amount capped by payment total minus sums in `SUCCEEDED`, `PENDING`, `PENDING_PROVIDER`, `PENDING_APPROVAL`.
- Idempotency record stored after create/approve paths.

### Verified (refund reservation)

- `createRefund` locks the payment row (`FOR UPDATE`), re-sums reserving statuses (`SUCCEEDED`, `PENDING`, `PENDING_PROVIDER`, `PENDING_APPROVAL`), inserts the refund row in the same transaction, then runs provider/cash execution **after** commit.
- Over-reservation returns **409** with `Refund amount exceeds remaining refundable balance`.
- `FAILED` / `REJECTED` refunds do not count toward reserved balance (retry allowed).

### Verified (approval)

- `approveRefund` locks the payment row, re-reads refund state, validates reserved totals, then **claims** execution with a conditional update (`PENDING_APPROVAL` → `PENDING` + `APPROVED`) so only one concurrent approver wins.
- Provider/cash execution runs **after** the claim transaction commits.
- `rejectRefund` uses the same payment lock and conditional update to release reservation (`REJECTED`).
- Repeated or concurrent approve attempts return **409** (`Refund approval already processed`) or **400** (not awaiting approval).

### Known gaps (P1)

- Provider refund webhooks are not modeled separately; status relies on API response + `finalizeRefund`.
- Retry after `FAILED` post-approval requires a new refund request (no automatic re-approve of the same row).

## Reconciliation

Background/admin batch (`POST /api/v1/admin/reconciliation/run`):

- Target payment `PENDING` / `UNKNOWN` stale > 15 menit.
- Inquiry provider + catat `payment_reconciliations`.
- Tidak melakukan refund/debit otomatis saat mismatch — butuh tindakan manusia.

Exceptions: `GET /api/v1/admin/reconciliation/exceptions`.
