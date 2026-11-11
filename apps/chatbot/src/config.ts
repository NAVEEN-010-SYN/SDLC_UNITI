/**
 * Typed runtime configuration, read once from environment variables.
 * No secrets are defaulted here; missing required values fail fast at startup.
 */

export interface DownstreamConfig {
  accountBaseUrl: string;
  billingBaseUrl: string;
  ticketBaseUrl: string;
  networkBaseUrl: string;
  timeoutMs: number;
  retries: number;
}

export interface LlmConfig {
  provider: 'none' | 'http';
  endpoint?: string;
  apiKey?: string;
  model?: string;
  timeoutMs: number;
}

export interface AuthConfig {
  issuer: string;
  audience: string;
  publicKey?: string;
  sharedSecret?: string;
}

export interface AppConfig {
  port: number;
  env: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  auth: AuthConfig;
  downstream: DownstreamConfig;
  llm: LlmConfig;
  nluMinConfidence: number;
  sessionTtlSeconds: number;
  rateLimit: { windowMs: number; maxMessages: number };
  analytics: { endpoint?: string; batchSize: number; flushIntervalMs: number };
  widgetAllowedOrigins: string[];
}

type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

function required(env: Env, key: string): string {
  const value = env[key];
  if (value === undefined || value.trim() === '') {
    throw new ConfigError(`Missing required environment variable ${key}`);
  }
  return value.trim();
}

function optional(env: Env, key: string): string | undefined {
  const value = env[key];
  return value && value.trim() !== '' ? value.trim() : undefined;
}

function intValue(env: Env, key: string, fallback: number, min = 0): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new ConfigError(`${key} must be an integer >= ${min}, got "${raw}"`);
  }
  return parsed;
}

function floatValue(env: Env, key: string, fallback: number, min: number, max: number): number {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new ConfigError(`${key} must be a number in [${min}, ${max}], got "${raw}"`);
  }
  return parsed;
}

function logLevel(raw: string | undefined): AppConfig['logLevel'] {
  const level = (raw ?? 'info').toLowerCase();
  if (level === 'debug' || level === 'info' || level === 'warn' || level === 'error') return level;
  throw new ConfigError(`LOG_LEVEL must be debug|info|warn|error, got "${raw}"`);
}

export function loadConfig(env: Env = process.env): AppConfig {
  const llmProvider = (optional(env, 'LLM_PROVIDER') ?? 'none').toLowerCase();
  if (llmProvider !== 'none' && llmProvider !== 'http') {
    throw new ConfigError(`LLM_PROVIDER must be none|http, got "${llmProvider}"`);
  }

  const publicKey = optional(env, 'JWT_PUBLIC_KEY');
  const sharedSecret = optional(env, 'JWT_SHARED_SECRET');
  if (!publicKey && !sharedSecret) {
    throw new ConfigError('Either JWT_PUBLIC_KEY or JWT_SHARED_SECRET must be configured');
  }

  const config: AppConfig = {
    port: intValue(env, 'PORT', 8080, 1),
    env: optional(env, 'NODE_ENV') ?? 'development',
    logLevel: logLevel(optional(env, 'LOG_LEVEL')),
    auth: {
      issuer: required(env, 'JWT_ISSUER'),
      audience: required(env, 'JWT_AUDIENCE'),
      publicKey,
      sharedSecret,
    },
    downstream: {
      accountBaseUrl: required(env, 'ACCOUNT_API_BASE_URL'),
      billingBaseUrl: required(env, 'BILLING_API_BASE_URL'),
      ticketBaseUrl: required(env, 'TICKET_API_BASE_URL'),
      networkBaseUrl: required(env, 'NETWORK_API_BASE_URL'),
      timeoutMs: intValue(env, 'DOWNSTREAM_TIMEOUT_MS', 4000, 100),
      retries: intValue(env, 'DOWNSTREAM_RETRIES', 2, 0),
    },
    llm: {
      provider: llmProvider,
      endpoint: optional(env, 'LLM_ENDPOINT'),
      apiKey: optional(env, 'LLM_API_KEY'),
      model: optional(env, 'LLM_MODEL'),
      timeoutMs: intValue(env, 'LLM_TIMEOUT_MS', 3000, 100),
    },
    nluMinConfidence: floatValue(env, 'NLU_MIN_CONFIDENCE', 0.55, 0, 1),
    sessionTtlSeconds: intValue(env, 'SESSION_TTL_SECONDS', 1800, 60),
    rateLimit: {
      windowMs: intValue(env, 'RATE_LIMIT_WINDOW_MS', 60_000, 1000),
      maxMessages: intValue(env, 'RATE_LIMIT_MAX_MESSAGES', 30, 1),
    },
    analytics: {
      endpoint: optional(env, 'ANALYTICS_ENDPOINT'),
      batchSize: intValue(env, 'ANALYTICS_BATCH_SIZE', 25, 1),
      flushIntervalMs: intValue(env, 'ANALYTICS_FLUSH_INTERVAL_MS', 5000, 100),
    },
    widgetAllowedOrigins: (optional(env, 'WIDGET_ALLOWED_ORIGINS') ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
  };

  if (config.llm.provider === 'http' && !config.llm.endpoint) {
    throw new ConfigError('LLM_ENDPOINT is required when LLM_PROVIDER=http');
  }
  return config;
}
