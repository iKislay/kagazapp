import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// Load .env from the repo root first, then apps/backend/.env — later wins.
loadDotenv({ path: new URL('../../../.env', import.meta.url).pathname });
loadDotenv({ path: new URL('../.env', import.meta.url).pathname, override: true });

/** A positive integer read from a string env var. */
const intVar = (fallback: number) => z.coerce.number().int().positive().default(fallback);

/**
 * Appendix A of IMPLEMENTATION_PLAN.md, as a schema.
 *
 * Only Core, Database and Observability are required at Phase 0/1 — the
 * integration secrets are declared here so that a missing one is caught at
 * boot rather than at the first webhook, but they stay optional until the
 * phase that uses them.
 */
const envSchema = z.object({
  // ---- Core ----
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intVar(8080),
  APP_VERSION: z.string().default('0.0.0-dev'),
  GIT_COMMIT: z.string().default('unknown'),

  // ---- Database ----
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required — see .env.example'),
  DIRECT_DATABASE_URL: z.string().optional(),

  // ---- Cloudflare R2 ----
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().default('kagaz-files'),
  R2_PUBLIC_BASE: z.string().optional(),

  // ---- WhatsApp Cloud API ----
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_BUSINESS_ACCOUNT_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().optional(),
  WHATSAPP_APP_SECRET: z.string().optional(),
  WHATSAPP_API_VERSION: z.string().default('v21.0'),

  // ---- Razorpay ----
  RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  RAZORPAY_ROUTE_ENABLED: z.coerce.boolean().default(true),

  // ---- Auth ----
  DEVICE_JWT_SECRET: z.string().optional(),
  DEVICE_JWT_TTL_DAYS: intVar(90),
  ADMIN_SESSION_SECRET: z.string().optional(),
  ADMIN_MAGIC_LINK_TTL_MIN: intVar(15),
  ADMIN_ALLOWED_EMAILS: z.string().default(''),

  // ---- Email ----
  SMTP_URL: z.string().optional(),
  ALERT_EMAIL: z.string().optional(),

  // ---- Observability ----
  SENTRY_DSN: z.string().optional(),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // ---- Tunables ----
  QUOTE_TTL_MINUTES: intVar(15),
  PAYMENT_LINK_TTL_MINUTES: intVar(15),
  PREFLIGHT_TIMEOUT_MS: intVar(5_000),
  DISPATCH_ACK_TIMEOUT_MS: intVar(60_000),
  PRINT_VERIFY_TIMEOUT_MS: intVar(120_000),
  HEARTBEAT_INTERVAL_MS: intVar(15_000),
  OFFLINE_THRESHOLD_MS: intVar(30_000),
  FILE_RETENTION_HOURS: intVar(24),
  MAX_UPLOAD_BYTES: intVar(52_428_800),
  CONVERSION_TIMEOUT_MS: intVar(60_000),
  STUCK_ORDER_THRESHOLD_MINUTES: intVar(120),
});

export type Env = z.infer<typeof envSchema>;

function parseEnv(source: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const lines = result.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join('\n')}\n\nSee .env.example.`);
  }
  return result.data;
}

export const env: Env = parseEnv(process.env);

export const isProduction = env.NODE_ENV === 'production';
export const isTest = env.NODE_ENV === 'test';

/** Exported for tests, which need to parse an env object other than the process one. */
export { parseEnv };
