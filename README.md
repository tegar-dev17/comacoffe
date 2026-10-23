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

Frontend admin:

```bash
npm run dev:web
# http://localhost:3000/payments
```

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

```bash
npm test
DATABASE_URL=postgresql://comacoffe:comacoffe@localhost:5432/comacoffe npm run test:integration -w @comacoffe/api
```

## Environment

Lihat [`.env.example`](.env.example). **Jangan** commit secret Midtrans/Xendit.
