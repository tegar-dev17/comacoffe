# Offline Behavior

## Cash

- Terminal menyimpan `localOperationId`, `deviceId`, `idempotencyKey`.
- Saat online, `POST /payments` dengan payload sama → idempotent (tidak double charge).
- Server menetapkan `SUCCEEDED` setelah validasi order.

## QRIS

- Jangan set `SUCCEEDED` saat offline.
- QR pending tetap `PENDING` / `UNKNOWN` sampai webhook atau inquiry.
- Setelah reconnect: `POST /payments/:id/refresh` (rate limited).
- Jangan buat charge baru jika payment sebelumnya masih `PENDING`/`UNKNOWN` untuk order yang sama (validasi di layer order — extend dengan unique partial index bila diperlukan).

## Limitations

Sinkronisasi antar-terminal saat internet **dan** LAN down membutuhkan local gateway (belum disertakan) — dokumentasikan conflict resolution di POS client.
