-- At most one in-flight payment per order (CREATED, PENDING, UNKNOWN).
-- If migration fails due to duplicate rows, resolve manually before re-running, e.g.:
--   SELECT order_id, count(*) FROM payments
--   WHERE status IN ('CREATED', 'PENDING', 'UNKNOWN')
--   GROUP BY order_id HAVING count(*) > 1;

CREATE UNIQUE INDEX IF NOT EXISTS "payments_one_active_per_order_uidx"
  ON "payments" ("order_id")
  WHERE "status" IN ('CREATED', 'PENDING', 'UNKNOWN');
