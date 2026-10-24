import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3001),
  API_BASE_URL: z.string().url().default("http://localhost:3001"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  PAYMENT_PROVIDER: z.enum(["midtrans", "xendit"]).default("midtrans"),
  PAYMENT_ENV: z.enum(["sandbox", "production"]).default("sandbox"),
  MIDTRANS_SERVER_KEY: z.string().optional(),
  MIDTRANS_CLIENT_KEY: z.string().optional(),
  MIDTRANS_MERCHANT_ID: z.string().optional(),
  MIDTRANS_API_BASE_URL: z.string().url().default("https://api.sandbox.midtrans.com"),
  XENDIT_SECRET_KEY: z.string().optional(),
  XENDIT_WEBHOOK_TOKEN: z.string().optional(),
  XENDIT_API_BASE_URL: z.string().url().default("https://api.xendit.co"),
  PAYMENT_REFRESH_RATE_LIMIT_PER_MINUTE: z.coerce.number().default(10),
  WEBHOOK_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(120),
  RECONCILIATION_BATCH_SIZE: z.coerce.number().default(50),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  ENABLE_DEV_ROUTES: z.preprocess(
    (val) => val === "true" || val === true,
    z.boolean().default(false),
  ),
  REFUND_APPROVAL_THRESHOLD_MINOR: z.coerce.number().int().positive().default(500_000),
  RECONCILIATION_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  RECONCILIATION_STALE_MINUTES: z.coerce.number().int().positive().default(15),
  OUTBOX_INTERVAL_MS: z.coerce.number().int().positive().default(5_000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().positive().default(8),
  ENABLE_RLS: z.preprocess((val) => val === "true" || val === true, z.boolean().default(false)),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

export function loadEnv(overrides?: Record<string, string>): Env {
  if (cached && !overrides) return cached;
  const parsed = envSchema.safeParse({ ...process.env, ...overrides });
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  if (!overrides) cached = parsed.data;
  return parsed.data;
}

export function resetEnvCacheForTests(): void {
  cached = null;
}

export function validatePaymentProviderConfig(env: Env): void {
  if (env.PAYMENT_PROVIDER === "midtrans" && !env.MIDTRANS_SERVER_KEY) {
    if (env.NODE_ENV === "production") {
      throw new Error("MIDTRANS_SERVER_KEY is required when PAYMENT_PROVIDER=midtrans in production");
    }
  }
  if (env.PAYMENT_PROVIDER === "xendit" && !env.XENDIT_SECRET_KEY) {
    if (env.NODE_ENV === "production") {
      throw new Error("XENDIT_SECRET_KEY is required when PAYMENT_PROVIDER=xendit in production");
    }
  }
}
