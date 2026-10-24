ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "is_active" boolean DEFAULT true NOT NULL;

ALTER TABLE "products" ADD COLUMN IF NOT EXISTS "barcode" text;

CREATE UNIQUE INDEX IF NOT EXISTS "products_tenant_barcode_uidx" ON "products" ("tenant_id", "barcode") WHERE "barcode" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "tenant_settings" (
  "tenant_id" uuid PRIMARY KEY NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "business_name" text,
  "address" text,
  "phone" text,
  "email" text,
  "receipt_footer" text,
  "timezone" text DEFAULT 'Asia/Jakarta' NOT NULL,
  "currency" text DEFAULT 'IDR' NOT NULL,
  "tax_rate_bps" integer DEFAULT 0 NOT NULL,
  "service_charge_bps" integer DEFAULT 0 NOT NULL,
  "require_open_shift" boolean DEFAULT false NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "cashier_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "outlet_id" uuid NOT NULL REFERENCES "outlets"("id") ON DELETE RESTRICT,
  "cashier_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "status" text DEFAULT 'open' NOT NULL,
  "opened_at" timestamp with time zone DEFAULT now() NOT NULL,
  "closed_at" timestamp with time zone,
  "opening_cash_minor" bigint DEFAULT 0 NOT NULL,
  "expected_cash_minor" bigint,
  "counted_cash_minor" bigint,
  "cash_variance_minor" bigint,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "cashier_shifts_one_open_per_outlet_uidx"
  ON "cashier_shifts" ("outlet_id") WHERE "status" = 'open';

CREATE INDEX IF NOT EXISTS "cashier_shifts_tenant_outlet_idx" ON "cashier_shifts" ("tenant_id", "outlet_id", "opened_at");

CREATE TABLE IF NOT EXISTS "shift_cash_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "shift_id" uuid NOT NULL REFERENCES "cashier_shifts"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE RESTRICT,
  "event_type" text NOT NULL,
  "amount_minor" bigint NOT NULL,
  "reason" text,
  "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL,
  "actor_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "shift_cash_events_shift_idx" ON "shift_cash_events" ("shift_id", "created_at");
