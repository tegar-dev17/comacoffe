# Production Readiness

## Implemented & tested

- Payment domain + migrations (Phase 2: merchant provider config refs, refund approval, outbox retries, job leases)
- **One active payment per order** (API transaction + partial unique index `0002`)
- Dev routes gated (`devRoutesEnabled`) + production JWT/env validation
- Midtrans adapter (Core API contract) with per-tenant credential resolution
- Xendit adapter (QR Codes + callback token) + unit tests for callback verification
- REST API v1 + RBAC + payment detail endpoint
- Webhook dedupe + tenant-scoped signature verification + reference ownership checks
- Payment transition row lock (stale webhook / out-of-order protection)
- Webhook route rate limiting (`WEBHOOK_RATE_LIMIT_PER_MINUTE`)
- `/ready` checks PostgreSQL connectivity
- GitHub Actions CI (typecheck, lint, unit, migrate, integration, build)
- Scheduled reconciliation worker (lease-protected) + admin batch API
- Refund approval workflow (separation of duties)
- Unit + integration security/transition/tenant tests
- Admin dashboard list + payment detail page
- Optional RLS SQL (`drizzle/0001_rls_optional.sql`) — **not enabled by default**; see plan below

## Before production

- [ ] Production Midtrans/Xendit keys in secret manager
- [ ] HTTPS termination + WAF
- [ ] Edge rate limits in addition to app-level webhook limits
- [ ] Observability (metrics/alerts UNKNOWN > SLA) — see `operations.md`
- [ ] Runbook insiden provider
- [ ] E2E sandbox in staging with real credentials (`MIDTRANS_E2E=1`)
- [ ] Refund concurrency hardening + approval integration tests
- [ ] RLS PostgreSQL per tenant (optional hardening — plan below)

## Row-Level Security (gap)

**Status:** SQL script exists; `ENABLE_RLS` env flag is **not** wired to session variables in the API pool.

**Safe rollout plan (recommended):**

1. Use a non-superuser DB role for the API in staging.
2. Apply `drizzle/0001_rls_optional.sql` in maintenance window.
3. Set `app.tenant_id` (or project convention) on each request via `SET LOCAL` inside transactions — verify Drizzle/pg pool does not pin connections incorrectly.
4. Run full integration suite with `ENABLE_RLS=true` before production.

## Credential rotation

1. Issue key baru di dashboard provider.
2. Deploy env rolling (dual-key window jika provider mendukung).
3. Rotate webhook token Xendit + update Notification URL.
4. Audit `payment_webhook_events` for auth failures spike.

## Rollback

- Deploy previous API image.
- Migrations forward-only — rollback app, not DB destructive scripts.
- Pause reconciliation job if provider outage.
