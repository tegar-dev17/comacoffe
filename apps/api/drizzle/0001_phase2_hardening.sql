DO $$ BEGIN
  CREATE TYPE "public"."refund_approval_status" AS ENUM('NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."provider_environment" AS ENUM('sandbox', 'production');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."merchant_config_status" AS ENUM('active', 'inactive', 'pending_verification');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TYPE "public"."refund_status" ADD VALUE IF NOT EXISTS 'PENDING_APPROVAL';--> statement-breakpoint
ALTER TYPE "public"."refund_status" ADD VALUE IF NOT EXISTS 'PENDING_PROVIDER';--> statement-breakpoint
ALTER TYPE "public"."refund_status" ADD VALUE IF NOT EXISTS 'REJECTED';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_provider_configs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL,
  "outlet_id" uuid,
  "provider" "payment_provider" NOT NULL,
  "environment" "provider_environment" NOT NULL,
  "merchant_reference" text,
  "enabled_methods" jsonb,
  "server_credential_ref" text,
  "client_credential_ref" text,
  "webhook_credential_ref" text,
  "api_base_url" text,
  "status" "merchant_config_status" DEFAULT 'active' NOT NULL,
  "created_by_user_id" uuid,
  "updated_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "merchant_provider_config_audits" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "config_id" uuid NOT NULL,
  "tenant_id" uuid NOT NULL,
  "actor_user_id" uuid,
  "action" text NOT NULL,
  "before_json" jsonb,
  "after_json" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "background_job_leases" (
  "job_name" text PRIMARY KEY NOT NULL,
  "locked_until" timestamp with time zone NOT NULL,
  "locked_by" text NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "outbox_dead_letters" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "outbox_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "payload_json" text NOT NULL,
  "error_message" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN IF NOT EXISTS "approval_status" "refund_approval_status" DEFAULT 'NOT_REQUIRED' NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN IF NOT EXISTS "approved_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN IF NOT EXISTS "rejected_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN IF NOT EXISTS "rejection_reason" text;--> statement-breakpoint
ALTER TABLE "payment_refunds" ADD COLUMN IF NOT EXISTS "approved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD COLUMN IF NOT EXISTS "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD COLUMN IF NOT EXISTS "dedupe_key" text;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD COLUMN IF NOT EXISTS "attempts" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD COLUMN IF NOT EXISTS "next_retry_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "transactional_outbox" ADD COLUMN IF NOT EXISTS "last_error" text;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "merchant_provider_configs" ADD CONSTRAINT "merchant_provider_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "merchant_provider_cfg_scope_uidx" ON "merchant_provider_configs" USING btree ("tenant_id","outlet_id","provider","environment");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "transactional_outbox_dedupe_uidx" ON "transactional_outbox" USING btree ("dedupe_key");
