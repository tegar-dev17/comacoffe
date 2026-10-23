# Payment Lifecycle

## Internal statuses

`CREATED`, `PENDING`, `SUCCEEDED`, `FAILED`, `EXPIRED`, `CANCELLED`, `UNKNOWN`, `REFUND_PENDING`, `PARTIALLY_REFUNDED`, `REFUNDED`.

## Rules

1. `SUCCEEDED` hanya dari webhook terverifikasi, inquiry provider, atau cash sync tervalidasi.
2. `PENDING` ≠ paid.
3. Timeout inquiry → `UNKNOWN`, bukan `FAILED`.
4. Transisi divalidasi (`state-machine.ts`); event lama tidak menurunkan status kuat tanpa aturan.
5. Semua transisi dicatat di `payment_events`.

## Sequence — QRIS (Midtrans)

```mermaid
sequenceDiagram
  participant POS
  participant API
  participant MT as Midtrans
  POS->>API: POST /payments (orderId, qris)
  API->>API: Load order total (server)
  API->>MT: POST /v2/charge (qris)
  MT-->>API: pending + QR URL
  API-->>POS: PENDING + instructions
  MT->>API: HTTP notification (signed)
  API->>API: Verify + idempotent transition
  API->>API: Mark order paid
```
