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

Automated E2E sandbox **BLOCKED** tanpa secret CI — gunakan mock HTTP untuk regression.
