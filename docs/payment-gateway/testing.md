# Testing

## Unit

```bash
npm test -w @comacoffe/api
```

Coverage utama: state machine, Midtrans signature mapping, adapter status normalization.

## Integration (PostgreSQL)

```bash
docker compose up -d
cp .env.example .env
npm run db:migrate -w @comacoffe/api
DATABASE_URL=postgresql://comacoffe:comacoffe@localhost:5432/comacoffe \
  JWT_SECRET=integration-test-secret-key-32chars \
  npm run test:integration -w @comacoffe/api
```

Skenario keamanan: tenant isolation, idempotency conflict, webhook signature, duplicate webhook.

## E2E sandbox (manual)

1. Bootstrap + token dev.
2. Buat order.
3. `POST /payments` dengan `paymentMethod=qris` + Midtrans sandbox key.
4. Bayar via simulator QRIS.
5. Verifikasi webhook + order `paid`.

Automated E2E sandbox (opt-in, tidak dijalankan oleh `npm test`):

```bash
MIDTRANS_E2E=1 MIDTRANS_SERVER_KEY=SB-Mid-server-... \
  DATABASE_URL=postgresql://comacoffe:comacoffe@localhost:5432/comacoffe \
  JWT_SECRET=integration-test-secret-key-32chars \
  npm run test:e2e:midtrans -w @comacoffe/api
```

**BLOCKED BY EXTERNAL DEPENDENCY** tanpa sandbox key + koneksi ke Midtrans. Mock HTTP bukan bukti E2E sandbox.
