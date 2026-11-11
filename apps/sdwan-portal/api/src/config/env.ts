import { z } from 'zod';

const intFromEnv = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (v === undefined || v === '') return fallback;
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected a non-negative integer, got "${v}"` });
        return z.NEVER;
      }
      return n;
    });

const boolFromEnv = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? fallback : ['1', 'true', 'yes'].includes(v.toLowerCase())));

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: intFromEnv(8080),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  CORS_ORIGINS: z.string().default(''),

  JWT_ISSUER: z.string().min(1).default('https://login.example-uniti.net/realms/selfcare'),
  JWT_AUDIENCE: z.string().min(1).default('sdwan-portal'),
  JWT_SECRET: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),

  SDWAN_PROVIDER_MODE: z.enum(['live', 'mock']).default('mock'),

  VCO_BASE_URL: z.string().url().optional(),
  VCO_USERNAME: z.string().optional(),
  VCO_PASSWORD: z.string().optional(),
  VCO_TIMEOUT_MS: intFromEnv(15000),

  FMG_BASE_URL: z.string().url().optional(),
  FMG_USERNAME: z.string().optional(),
  FMG_PASSWORD: z.string().optional(),
  FMG_ADOM_DEFAULT: z.string().default('root'),
  FMG_POLICY_PACKAGE: z.string().default('default'),
  FGT_API_TOKEN: z.string().optional(),
  FGT_VERIFY_TLS: boolFromEnv(true),
  FORTI_TIMEOUT_MS: intFromEnv(15000),

  HTTP_MAX_RETRIES: intFromEnv(3),
  HTTP_BACKOFF_BASE_MS: intFromEnv(250),
  HTTP_BACKOFF_MAX_MS: intFromEnv(5000),

  METRICS_POLL_INTERVAL_SEC: intFromEnv(300),
  ALERT_EVAL_INTERVAL_SEC: intFromEnv(60),
  CHANGE_EXECUTOR_INTERVAL_SEC: intFromEnv(60),
  METRICS_RETENTION_HOURS: intFromEnv(168),
  INVENTORY_CACHE_TTL_SEC: intFromEnv(120),
});

export type AppConfig = z.infer<typeof EnvSchema>;

/**
 * Parses and validates process environment. Fails fast at boot with a readable
 * message listing every invalid variable, rather than surfacing at first use.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  const cfg = parsed.data;
  if (!cfg.JWT_SECRET && !cfg.JWT_PUBLIC_KEY) {
    throw new Error('Invalid environment configuration:\n  one of JWT_SECRET or JWT_PUBLIC_KEY must be set');
  }
  if (cfg.SDWAN_PROVIDER_MODE === 'live') {
    const missing: string[] = [];
    if (!cfg.VCO_BASE_URL) missing.push('VCO_BASE_URL');
    if (!cfg.VCO_USERNAME || !cfg.VCO_PASSWORD) missing.push('VCO_USERNAME/VCO_PASSWORD');
    if (!cfg.FMG_BASE_URL) missing.push('FMG_BASE_URL');
    if (!cfg.FMG_USERNAME || !cfg.FMG_PASSWORD) missing.push('FMG_USERNAME/FMG_PASSWORD');
    if (missing.length) {
      throw new Error(`Invalid environment configuration:\n  live provider mode requires ${missing.join(', ')}`);
    }
  }
  return cfg;
}
