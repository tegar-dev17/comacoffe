# Operations and diagnostics

## Structured logging

- Fastify assigns **`x-request-id`** (or generates a UUID). Use this ID across API logs when correlating a cashier action with webhook processing.
- Webhook handlers log errors with `request.log.error({ err }, ...)` without printing raw `Authorization` headers or provider secrets.
- Stored webhook headers redact keys containing `authorization` or `token` before persistence.

## Health endpoints

| Route | Meaning |
| --- | --- |
| `GET /health` | Process is up (liveness). |
| `GET /ready` | **503** when PostgreSQL is unreachable; **200** with `status: ready` or `degraded` (provider keys missing in non-critical dev/test setups). |

## Tracing a payment (safe checklist)

1. **Order** — `orders.id`, `order_number`, tenant/outlet on the row.
2. **Payment** — `payments.id`, `provider_reference`, `status`, `idempotency_key`.
3. **Events** — `payment_events` ordered by `created_at` (API, webhook, reconciliation sources).
4. **Webhooks** — `payment_webhook_events` by `provider_event_id` (dedupe index) and `processing_status`.
5. **Reconciliation** — `payment_reconciliations` for inquiry mismatches.
6. **Outbox** — `outbox_events` for downstream POS notification (stub/worker).

Do not export full `raw_body_json` from webhooks into ticket systems if it may contain PII; reference internal IDs instead.

## Common failures

| Symptom | Likely cause | Next step |
| --- | --- | --- |
| Webhook 401 | Invalid Midtrans `signature_key` or Xendit callback token | Verify tenant merchant config / env key matches provider dashboard |
| Payment stays PENDING | Webhook not delivered or signature failed | Check `payment_webhook_events.signature_valid`; replay from provider dashboard if supported |
| 409 on create payment | Active payment already exists for order | Wait for terminal status or cancel in-flight payment |
| Reconciliation MISMATCH | Provider status differs from internal | Review `payment_reconciliations.notes`; manual inquiry in provider sandbox |
| Refund 400 amount | Sum of pending/succeeded refunds exceeds payment | List `payment_refunds` for the payment |

## Verified vs planned

- **Verified:** Webhook dedupe by `(provider, provider_event_id)`; amount/currency mismatch fails processing; transition guard reloads current DB status under row lock.
- **Planned:** Metrics/alerts on `UNKNOWN` backlog; centralized log aggregation; webhook IP allowlists (provider-specific).
