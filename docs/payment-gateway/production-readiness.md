# Production Readiness

## Implemented & tested

- Payment domain + migrations (Phase 2: merchant provider config refs, refund approval, outbox retries, job leases)
- Dev routes gated (`devRoutesEnabled`) + production JWT/env validation
- Midtrans adapter (Core API contract) with per-tenant credential resolution
- Xendit adapter (QR Codes + callback token)
- REST API v1 + RBAC + payment detail endpoint
- Webhook dedupe + tenant-scoped signature verification
- Scheduled reconciliation worker (lease-protected) + admin batch API
- Refund approval workflow (separation of duties)
- Unit + integration security tests (extended tenant isolation)
- Admin dashboard list + payment detail page
- Optional RLS SQL (`drizzle/0001_rls_optional.sql`) — apply manually when using non-superuser DB role

## Before production

- [ ] Production Midtrans/Xendit keys in secret manager
- [ ] HTTPS termination + WAF
- [ ] Rate limit gateway untuk webhook/public routes
- [ ] Observability (metrics/alerts UNKNOWN > SLA)
- [ ] Runbook insiden provider
- [ ] E2E sandbox in staging with real credentials
- [ ] Approval workflow refund multi-step (opsional)
- [ ] RLS PostgreSQL per tenant (opsional hardening)

## Credential rotation

1. Issue key baru di dashboard provider.
2. Deploy env rolling (dual-key window jika provider mendukung).
3. Rotate webhook token Xendit + update Notification URL.
4. Audit `payment_webhook_events` for auth failures spike.

## Rollback

- Deploy previous API image.
- Migrations forward-only — rollback app, not DB destructive scripts.
- Pause reconciliation job if provider outage.
