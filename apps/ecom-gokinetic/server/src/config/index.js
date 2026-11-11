'use strict';

/**
 * Centralised, validated runtime configuration.
 *
 * Every value is read from environment variables (see `.env.example`). Nothing
 * secret has a default: missing secrets fail fast at boot in production and
 * fall back to obviously-unsafe development placeholders elsewhere.
 */

require('dotenv').config();

const env = process.env;

function readString(name, fallback) {
  const value = env[name];
  if (value === undefined || value === '') return fallback;
  return value;
}

function readInt(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Environment variable ${name} must be an integer, got "${raw}"`);
  }
  return parsed;
}

function readBool(name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function readList(name, fallback) {
  const raw = env[name];
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = readString('NODE_ENV', 'development');
const isProduction = nodeEnv === 'production';

function requireSecret(name, devFallback) {
  const value = readString(name, undefined);
  if (value) return value;
  if (isProduction) {
    throw new Error(`Missing required secret environment variable ${name}`);
  }
  return devFallback;
}

const config = Object.freeze({
  nodeEnv,
  isProduction,
  isTest: nodeEnv === 'test',
  port: readInt('PORT', 4000),
  logLevel: readString('LOG_LEVEL', 'info'),
  corsOrigins: readList('CORS_ORIGINS', ['http://localhost:5173']),

  mongo: Object.freeze({
    uri: readString('MONGODB_URI', 'mongodb://localhost:27017/ecom_gokinetic'),
  }),

  auth: Object.freeze({
    jwtSecret: requireSecret('JWT_SECRET', 'dev-only-insecure-secret'),
    issuer: readString('JWT_ISSUER', 'https://auth.gokinetic.example'),
    audience: readString('JWT_AUDIENCE', 'ecom-gokinetic-api'),
    accessTtlSeconds: readInt('JWT_ACCESS_TTL_SECONDS', 900),
    refreshTtlSeconds: readInt('JWT_REFRESH_TTL_SECONDS', 1209600),
    bcryptRounds: readInt('BCRYPT_ROUNDS', 12),
  }),

  rateLimit: Object.freeze({
    windowMs: readInt('RATE_LIMIT_WINDOW_MS', 60000),
    max: readInt('RATE_LIMIT_MAX', 120),
    authMax: readInt('RATE_LIMIT_AUTH_MAX', 10),
  }),

  commerce: Object.freeze({
    currency: readString('DEFAULT_CURRENCY', 'USD'),
    cartTtlHours: readInt('CART_TTL_HOURS', 72),
    quoteValidityDays: readInt('QUOTE_VALIDITY_DAYS', 30),
    quoteApprovalDiscountBps: readInt('QUOTE_APPROVAL_DISCOUNT_BPS', 1500),
  }),

  paymentGateway: Object.freeze({
    baseUrl: readString('PAYMENT_GATEWAY_BASE_URL', 'https://payments.sandbox.example/v2'),
    apiKey: requireSecret('PAYMENT_GATEWAY_API_KEY', 'sandbox-key'),
    timeoutMs: readInt('PAYMENT_GATEWAY_TIMEOUT_MS', 8000),
  }),

  serviceability: Object.freeze({
    baseUrl: readString('SERVICEABILITY_API_BASE_URL', 'https://serviceability.sandbox.example/v1'),
    apiKey: requireSecret('SERVICEABILITY_API_KEY', 'sandbox-key'),
    cacheTtlHours: readInt('SERVICEABILITY_CACHE_TTL_HOURS', 24),
    timeoutMs: readInt('SERVICEABILITY_API_TIMEOUT_MS', 5000),
  }),

  email: Object.freeze({
    baseUrl: readString('EMAIL_API_BASE_URL', 'https://mail.sandbox.example/v3'),
    apiKey: requireSecret('EMAIL_API_KEY', 'sandbox-key'),
    fromAddress: readString('EMAIL_FROM_ADDRESS', 'orders@gokinetic.example'),
    timeoutMs: readInt('EMAIL_API_TIMEOUT_MS', 5000),
  }),

  jobs: Object.freeze({
    enabled: readBool('JOBS_ENABLED', true),
    orderValidationIntervalMs: readInt('JOB_ORDER_VALIDATION_INTERVAL_MS', 60000),
    abandonedCartIntervalMs: readInt('JOB_ABANDONED_CART_INTERVAL_MS', 900000),
    quoteExpiryIntervalMs: readInt('JOB_QUOTE_EXPIRY_INTERVAL_MS', 3600000),
    billingIntervalMs: readInt('JOB_BILLING_INTERVAL_MS', 21600000),
    abandonedCartIdleHours: readInt('ABANDONED_CART_IDLE_HOURS', 24),
  }),

  urls: Object.freeze({
    storefront: readString('STOREFRONT_BASE_URL', 'http://localhost:5173'),
    businessPortal: readString('BUSINESS_PORTAL_BASE_URL', 'http://localhost:5173/business'),
  }),

  billing: Object.freeze({
    consumerDueDays: readInt('BILLING_CONSUMER_DUE_DAYS', 14),
    maxUsersPerBusinessAccount: readInt('MAX_USERS_PER_BUSINESS_ACCOUNT', 50),
  }),
});

module.exports = config;
