# Comacoffe — POS F&B SaaS (Payment Gateway)

Monorepo untuk POS coffee shop / F&B multi-tenant dengan modul **payment gateway** provider-neutral (Midtrans Core API QRIS + Xendit QR Codes), state machine, webhook aman, refund, rekonsiliasi, dan dashboard admin.

## Stack

| Layer | Teknologi |
| --- | --- |
| API | Fastify 5, TypeScript, Drizzle ORM, PostgreSQL |
| Web admin | Next.js 15 (App Router) |
| Auth | JWT (tenant + role + outlet context) |
| Tests | Vitest (unit + integration) |

## Quick start

```bash
cp .env.example .env
docker compose up -d
npm install
npm run db:generate -w @comacoffe/api
npm run db:migrate -w @comacoffe/api
npm run dev -w @comacoffe/api
```

Bootstrap data dev (tenant demo + token):

```bash
curl -X POST http://localhost:3001/api/v1/dev/bootstrap
curl -X POST http://localhost:3001/api/v1/dev/token -H 'Content-Type: application/json' -d '{"userId":"<admin-user-id>"}'
```

Frontend (POS + admin):

```bash
npm run dev:web
# http://localhost:3000/login
```

Login demo (after bootstrap): `cashier@demo.coffee` / `demo1234` — halaman **Kasir** di `/pos`.

- **Bayar Tunai** works without Midtrans/Xendit keys.
- **QRIS** in local `NODE_ENV=development` without `MIDTRANS_SERVER_KEY` uses a **dev mock** (pending QR + `POST /api/v1/dev/payments/:paymentId/simulate-success` to complete). For real sandbox QRIS, set `MIDTRANS_SERVER_KEY` in `.env`.

## Payment API (v1)

- `POST /api/v1/payments` — buat pembayaran (amount dari order server-side)
- `GET /api/v1/payments/:paymentId`
- `GET /api/v1/payments` — list + filter
- `POST /api/v1/payments/:paymentId/refresh`
- `POST /api/v1/payments/:paymentId/cancel`
- `POST /api/v1/payments/:paymentId/refunds`
- `POST /api/v1/webhooks/midtrans/notification`
- `POST /api/v1/webhooks/xendit/qris`
- `POST /api/v1/admin/reconciliation/run`

Dokumentasi lengkap: [`docs/payment-gateway/`](docs/payment-gateway/).

## Tests

### Prerequisites

- **PostgreSQL 16** (local or Docker). Quick start: `docker compose up -d` uses the credentials in `.env.example`.
- Copy env: `cp .env.example .env` and keep provider keys empty for automated tests.

### Unit tests (no database required for most suites)

From the repo root:

```bash
npm test
```

Runs Vitest unit tests in `apps/api` (state machine, adapters, active-payment status helpers, dev-route guards, etc.).

### API integration tests

Integration tests migrate the test database automatically via `setupIntegrationDb()` before running.

```bash
export DATABASE_URL=postgresql://comacoffe:comacoffe@localhost:5432/comacoffe
export JWT_SECRET=change-me-in-production-min-32-chars-long
export NODE_ENV=test

npm run test:integration -w @comacoffe/api
```

Optional Midtrans sandbox E2E (real network; requires credentials and `MIDTRANS_E2E=1`):

```bash
npm run test:e2e:midtrans -w @comacoffe/api
```

### Lint, typecheck, build

```bash
npm run typecheck
npm run lint
npm run build
```

Apply migrations manually when developing against a local DB:

```bash
npm run db:migrate -w @comacoffe/api
```

### Duplicate active payment (HTTP 409)

While an order still has a payment in **`CREATED`**, **`PENDING`**, or **`UNKNOWN`**, creating another payment for the same order returns **409 Conflict** with:

`Order already has an active payment in progress`

Idempotency keys are unchanged: repeating `POST /api/v1/payments` with the same key and payload returns the stored response. After a prior payment reaches a terminal status (e.g. **FAILED**, **SUCCEEDED**, **CANCELLED**, **EXPIRED**), a new payment attempt is allowed when the order is still eligible.

A partial unique index (`payments_one_active_per_order_uidx`) enforces at most one in-flight payment per order at the database level.

## CI (GitHub Actions)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

| Trigger | Branch |
| --- | --- |
| `push` | `main` |
| `pull_request` | targeting `main` |

Steps: `npm ci` → typecheck → lint → unit tests → PostgreSQL 16 service → migrations → integration tests → build. Test env uses placeholder `JWT_SECRET` and a local `DATABASE_URL`; no Midtrans/Xendit production credentials.

## Authorization (tenant / outlet)

- JWT carries `tenantId`, `role`, and optional `outletId`.
- Payment, order, refund, and reconciliation APIs filter by **tenant** on the server; cashiers with an `outletId` are restricted to that outlet for payment reads/writes.
- Webhooks are unauthenticated HTTP callbacks; trust is established via **provider signatures/tokens** and correlation to existing payment rows (no cross-tenant mutation without a matching payment record).
- Dev bootstrap/token routes are disabled unless `NODE_ENV=development` or `ENABLE_DEV_ROUTES=true` (never in production).

Details: [`docs/payment-gateway/production-readiness.md`](docs/payment-gateway/production-readiness.md), [`docs/payment-gateway/webhook-security.md`](docs/payment-gateway/webhook-security.md).

## Production readiness (summary)

| Topic | Doc |
| --- | --- |
| Payment lifecycle & transitions | [`payment-lifecycle.md`](docs/payment-gateway/payment-lifecycle.md) |
| Webhooks & rate limits | [`webhook-security.md`](docs/payment-gateway/webhook-security.md) |
| Refund / reconciliation limits | [`refund-and-reconciliation.md`](docs/payment-gateway/refund-and-reconciliation.md) |
| Ops / diagnostics | [`operations.md`](docs/payment-gateway/operations.md) |

**Remaining risks (verified in code review):** RLS not enabled; reconciliation can apply provider status when amounts match but statuses differ; Midtrans/Xendit live behavior requires sandbox E2E/manual verification.

Refund over-reservation is blocked via payment row lock + transactional insert (`409` when remaining balance is insufficient).

## Environment

Lihat [`.env.example`](.env.example). **Jangan** commit secret Midtrans/Xendit.
