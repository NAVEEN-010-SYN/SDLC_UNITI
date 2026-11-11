import { z } from 'zod';

const EnvSchema = z
  .object({
    PORT: z.coerce.number().int().positive().default(8080),
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
    CORS_ALLOWED_ORIGINS: z.string().default(''),
    DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
    DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
    DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
    JWT_ISSUER: z.string().min(1),
    JWT_AUDIENCE: z.string().min(1),
    JWT_PUBLIC_KEY: z.string().optional().default(''),
    JWT_SHARED_SECRET: z.string().optional().default(''),
    DOCUMENT_BASE_URL: z.string().url(),
    DOCUMENT_SIGNING_SECRET: z.string().min(16, 'DOCUMENT_SIGNING_SECRET must be at least 16 characters'),
    DOCUMENT_LINK_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(300),
    SLA_DEFAULT_TIMEZONE: z.string().default('Europe/London'),
    PAYMENTS_GATEWAY_URL: z.string().url(),
    PAYMENTS_GATEWAY_API_KEY: z.string().min(1, 'PAYMENTS_GATEWAY_API_KEY is required'),
    PAYMENTS_GATEWAY_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8000)
  })
  .superRefine((env, ctx) => {
    if (!env.JWT_PUBLIC_KEY && !env.JWT_SHARED_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either JWT_PUBLIC_KEY or JWT_SHARED_SECRET must be configured',
        path: ['JWT_PUBLIC_KEY']
      });
    }
    if (env.NODE_ENV === 'production' && env.JWT_SHARED_SECRET && !env.JWT_PUBLIC_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Shared-secret JWT verification is not permitted in production',
        path: ['JWT_SHARED_SECRET']
      });
    }
  });

export type AppConfig = Readonly<{
  port: number;
  env: 'development' | 'test' | 'production';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  corsAllowedOrigins: string[];
  database: { url: string; poolMax: number; statementTimeoutMs: number };
  jwt: { issuer: string; audience: string; publicKey: string; sharedSecret: string };
  documents: { baseUrl: string; signingSecret: string; linkTtlSeconds: number };
  sla: { defaultTimezone: string };
  payments: { baseUrl: string; apiKey: string; timeoutMs: number };
}>;

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${detail}`);
  }
  const env = parsed.data;
  return Object.freeze({
    port: env.PORT,
    env: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      statementTimeoutMs: env.DATABASE_STATEMENT_TIMEOUT_MS
    },
    jwt: {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      publicKey: env.JWT_PUBLIC_KEY.replace(/\\n/g, '\n'),
      sharedSecret: env.JWT_SHARED_SECRET
    },
    documents: {
      baseUrl: env.DOCUMENT_BASE_URL.replace(/\/$/, ''),
      signingSecret: env.DOCUMENT_SIGNING_SECRET,
      linkTtlSeconds: env.DOCUMENT_LINK_TTL_SECONDS
    },
    sla: { defaultTimezone: env.SLA_DEFAULT_TIMEZONE },
    payments: {
      baseUrl: env.PAYMENTS_GATEWAY_URL.replace(/\/$/, ''),
      apiKey: env.PAYMENTS_GATEWAY_API_KEY,
      timeoutMs: env.PAYMENTS_GATEWAY_TIMEOUT_MS
    }
  });
}
