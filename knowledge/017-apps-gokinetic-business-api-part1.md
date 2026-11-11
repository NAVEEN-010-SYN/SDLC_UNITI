# Go Kinetic Business self-care (B2B): apps/gokinetic-business/api (part 1 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 31

## Files

- `apps/gokinetic-business/api/.env.example` (31 lines)
- `apps/gokinetic-business/api/Dockerfile` (22 lines)
- `apps/gokinetic-business/api/jest.config.js` (13 lines)
- `apps/gokinetic-business/api/package.json` (44 lines)
- `apps/gokinetic-business/api/src/app.test.ts` (72 lines)
- `apps/gokinetic-business/api/src/app.ts` (68 lines)
- `apps/gokinetic-business/api/src/auth/jwt.ts` (71 lines)
- `apps/gokinetic-business/api/src/auth/permissions.ts` (113 lines)
- `apps/gokinetic-business/api/src/config/env.ts` (91 lines)
- `apps/gokinetic-business/api/src/db/migrate.ts` (53 lines)
- `apps/gokinetic-business/api/src/db/migrations/001_initial_schema.sql` (262 lines)
- `apps/gokinetic-business/api/src/db/migrations/002_payment_methods_and_outbox.sql` (43 lines)
- `apps/gokinetic-business/api/src/db/query.ts` (131 lines)
- `apps/gokinetic-business/api/src/lib/asyncHandler.ts` (11 lines)
- `apps/gokinetic-business/api/src/lib/dates.ts` (70 lines)
- `apps/gokinetic-business/api/src/lib/errors.ts` (98 lines)
- `apps/gokinetic-business/api/src/lib/logger.ts` (77 lines)
- `apps/gokinetic-business/api/src/lib/money.ts` (90 lines)
- `apps/gokinetic-business/api/src/lib/pagination.ts` (31 lines)
- `apps/gokinetic-business/api/src/lib/references.ts` (22 lines)
- `apps/gokinetic-business/api/src/middleware/auth.ts` (60 lines)
- `apps/gokinetic-business/api/src/middleware/correlationId.ts` (21 lines)
- `apps/gokinetic-business/api/src/middleware/cors.ts` (35 lines)
- `apps/gokinetic-business/api/src/middleware/errorHandler.ts` (74 lines)
- `apps/gokinetic-business/api/src/middleware/requestLogger.ts` (23 lines)
- `apps/gokinetic-business/api/src/middleware/validate.ts` (44 lines)
- `apps/gokinetic-business/api/src/modules/accounts/accounts.repository.ts` (58 lines)
- `apps/gokinetic-business/api/src/modules/accounts/accounts.routes.ts` (42 lines)
- `apps/gokinetic-business/api/src/modules/accounts/accounts.service.test.ts` (57 lines)
- `apps/gokinetic-business/api/src/modules/accounts/accounts.service.ts` (74 lines)
- `apps/gokinetic-business/api/src/modules/audit/audit.repository.ts` (86 lines)

## apps/gokinetic-business/api/.env.example

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: bash. Path: `apps/gokinetic-business/api/.env.example`.

```bash
# HTTP
PORT=8080
NODE_ENV=development
LOG_LEVEL=info
CORS_ALLOWED_ORIGINS=http://localhost:4200

# PostgreSQL
DATABASE_URL=postgres://gkb_app:change-me@localhost:5432/gokinetic_business
DATABASE_POOL_MAX=10
DATABASE_STATEMENT_TIMEOUT_MS=5000

# OIDC / JWT (bearer tokens issued by the Uniti identity provider)
JWT_ISSUER=https://id.example-uniti.net/realms/business
JWT_AUDIENCE=gokinetic-business-api
# Either a PEM public key (RS256) or a shared secret (HS256, local dev only)
JWT_PUBLIC_KEY=
JWT_SHARED_SECRET=

# Document storage (pre-signed download links)
DOCUMENT_BASE_URL=https://docs.example-uniti.net/business
DOCUMENT_SIGNING_SECRET=
DOCUMENT_LINK_TTL_SECONDS=300

# SLA
SLA_DEFAULT_TIMEZONE=Europe/London

# Payment service provider (card tokens are created client-side by the provider's hosted fields)
PAYMENTS_GATEWAY_URL=https://payments.example-uniti.net
PAYMENTS_GATEWAY_API_KEY=
PAYMENTS_GATEWAY_TIMEOUT_MS=8000
```

## apps/gokinetic-business/api/Dockerfile

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: dockerfile. Path: `apps/gokinetic-business/api/Dockerfile`.

```dockerfile
# syntax=docker/dockerfile:1.6
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations
COPY package.json ./
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/health/live || exit 1
CMD ["node", "dist/server.js"]
```

## apps/gokinetic-business/api/jest.config.js

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: javascript. Path: `apps/gokinetic-business/api/jest.config.js`.

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/db/migrate.ts', '!src/test/**'],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 80, statements: 80 }
  },
  clearMocks: true
};
```

## apps/gokinetic-business/api/package.json

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: json. Path: `apps/gokinetic-business/api/package.json`.

```json
{
  "name": "@uniti/gokinetic-business-api",
  "version": "1.0.0",
  "private": true,
  "description": "Go Kinetic Business self-care API (B2B): sites, services, users, orders, billing, SLA, tickets, contracts, documents",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/server.js",
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "migrate": "ts-node src/db/migrate.ts",
    "lint": "eslint \"src/**/*.ts\"",
    "test": "jest",
    "test:coverage": "jest --coverage"
  },
  "engines": {
    "node": ">=20"
  },
  "dependencies": {
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "pg": "^8.11.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.12.12",
    "@types/pg": "^8.11.6",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^7.10.0",
    "@typescript-eslint/parser": "^7.10.0",
    "eslint": "^8.57.0",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.4",
    "ts-node": "^10.9.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  }
}
```

## apps/gokinetic-business/api/src/app.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/app.test.ts`.

```typescript
import { Router } from 'express';
import request from 'supertest';
import { createApp } from './app';
import { TokenVerifier } from './auth/jwt';
import { UnauthorizedError } from './lib/errors';
import { requirePermission } from './middleware/auth';
import { adminCtx, userCtx } from './test/fixtures';

const ORIGIN = 'https://business.example-uniti.net';

function build(ready: () => Promise<void> = async () => undefined) {
  const verifier: TokenVerifier = {
    verify: (token) => {
      if (token === 'admin') return adminCtx();
      if (token === 'user') return userCtx();
      throw new UnauthorizedError('Access token is invalid');
    }
  };
  const probe = Router();
  probe.get('/probe', requirePermission('users:manage'), (req, res) => {
    res.json({ accountId: req.auth?.accountId });
  });
  return createApp({ config: { corsAllowedOrigins: [ORIGIN], env: 'test' }, verifier, health: { ready }, routers: [probe] });
}

describe('createApp', () => {
  it('serves liveness and readiness', async () => {
    await request(build()).get('/health/live').expect(200, { status: 'ok' });
    await request(build(async () => Promise.reject(new Error('db down')))).get('/health/ready').expect(503);
  });

  it('returns problem+json with the correlation id for missing tokens', async () => {
    const res = await request(build()).get('/api/v1/probe').set('X-Correlation-Id', 'test-corr-0001').expect(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.headers['x-correlation-id']).toBe('test-corr-0001');
    expect(res.body).toMatchObject({ status: 401, correlationId: 'test-corr-0001', instance: '/api/v1/probe' });
  });

  it('enforces permissions server-side', async () => {
    await request(build()).get('/api/v1/probe').set('Authorization', 'Bearer user').expect(403);
    const res = await request(build()).get('/api/v1/probe').set('Authorization', 'Bearer admin').expect(200);
    expect(res.body.accountId).toBe(adminCtx().accountId);
    expect(res.headers['cache-control']).toBe('private, no-cache');
  });

  it('answers CORS preflight only for allowed origins', async () => {
    const ok = await request(build())
      .options('/api/v1/probe')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-headers']).toContain('X-Correlation-Id');

    await request(build())
      .options('/api/v1/probe')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET')
      .expect(403);
  });

  it('maps malformed JSON bodies to a 400 problem', async () => {
    const res = await request(build())
      .post('/api/v1/probe')
      .set('Authorization', 'Bearer admin')
      .set('Content-Type', 'application/json')
      .send('{bad json')
      .expect(400);
    expect(res.body.title).toBe('Malformed request body');
  });
});
```

## apps/gokinetic-business/api/src/app.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/app.ts`.

```typescript
import express, { Express, Router } from 'express';
import helmet from 'helmet';
import { AppConfig } from './config/env';
import { TokenVerifier } from './auth/jwt';
import { authenticate } from './middleware/auth';
import { correlationId } from './middleware/correlationId';
import { cors } from './middleware/cors';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { asyncHandler } from './lib/asyncHandler';

export interface HealthCheck {
  /** Resolves when downstream dependencies (database) are reachable. */
  ready(): Promise<void>;
}

export interface AppDependencies {
  config: Pick<AppConfig, 'corsAllowedOrigins' | 'env'>;
  verifier: TokenVerifier;
  health: HealthCheck;
  /** Feature routers mounted under /api/v1 behind authentication. */
  routers: Router[];
}

export const API_PREFIX = '/api/v1';

/** Builds the Express app. Kept free of I/O so it can be exercised with supertest. */
export function createApp(deps: AppDependencies): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(correlationId());
  app.use(requestLogger());
  app.use(helmet());
  app.use(cors(deps.config.corsAllowedOrigins));
  app.use(express.json({ limit: '256kb' }));

  app.get('/health/live', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      try {
        await deps.health.ready();
        res.json({ status: 'ok' });
      } catch {
        res.status(503).json({ status: 'unavailable' });
      }
    })
  );

  const api = Router();
  api.use(authenticate(deps.verifier));
  api.use((_req, res, next) => {
    // Customer data must never be cached by shared proxies.
    if (!res.getHeader('Cache-Control')) res.setHeader('Cache-Control', 'private, no-cache');
    next();
  });
  for (const router of deps.routers) api.use(router);
  app.use(API_PREFIX, api);

  app.use(notFoundHandler());
  app.use(errorHandler());
  return app;
}
```

## apps/gokinetic-business/api/src/auth/jwt.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/auth/jwt.ts`.

```typescript
import jwt, { JwtPayload } from 'jsonwebtoken';
import { AuthContext, ROLES, Role } from './permissions';
import { UnauthorizedError } from '../lib/errors';

export interface JwtSettings {
  issuer: string;
  audience: string;
  publicKey: string;
  sharedSecret: string;
}

const ACCOUNT_ID = /^ACC-\d{8}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface BusinessClaims extends JwtPayload {
  email?: string;
  roles?: unknown;
  account_id?: unknown;
  site_scope?: unknown;
}

export interface TokenVerifier {
  verify(token: string): AuthContext;
}

export function createTokenVerifier(settings: JwtSettings): TokenVerifier {
  const key = settings.publicKey || settings.sharedSecret;
  const algorithms: jwt.Algorithm[] = settings.publicKey ? ['RS256', 'ES256'] : ['HS256'];

  return {
    verify(token: string): AuthContext {
      let claims: BusinessClaims;
      try {
        claims = jwt.verify(token, key, {
          issuer: settings.issuer,
          audience: settings.audience,
          algorithms,
          clockTolerance: 30
        }) as BusinessClaims;
      } catch (err) {
        const reason = err instanceof jwt.TokenExpiredError ? 'Access token has expired' : 'Access token is invalid';
        throw new UnauthorizedError(reason);
      }
      return claimsToContext(claims);
    }
  };
}

export function claimsToContext(claims: BusinessClaims): AuthContext {
  if (!claims.sub || !UUID.test(claims.sub)) throw new UnauthorizedError('Token subject is missing or malformed');
  if (typeof claims.account_id !== 'string' || !ACCOUNT_ID.test(claims.account_id)) {
    throw new UnauthorizedError('Token is not bound to a business account');
  }
  const rawRoles = Array.isArray(claims.roles) ? claims.roles : [];
  const roles = rawRoles.filter((r): r is Role => typeof r === 'string' && (ROLES as readonly string[]).includes(r));
  if (roles.length === 0) throw new UnauthorizedError('Token carries no business self-care role');

  let siteScope: string[] | null = null;
  if (Array.isArray(claims.site_scope)) {
    siteScope = claims.site_scope.filter((s): s is string => typeof s === 'string' && UUID.test(s));
  }

  return {
    userId: claims.sub,
    email: typeof claims.email === 'string' ? claims.email : '',
    roles,
    accountId: claims.account_id,
    siteScope
  };
}
```

## apps/gokinetic-business/api/src/auth/permissions.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/auth/permissions.ts`.

```typescript
/**
 * Role-based access control for the business self-care portal.
 *
 * Roles come from the identity provider (JWT `roles` claim). Permissions are derived here
 * so that a role change in the IdP never needs a code change in consumers of `can()`.
 */
export const ROLES = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT'] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  'sites:read',
  'sites:manage',
  'services:read',
  'users:read',
  'users:manage',
  'orders:read',
  'orders:create',
  'orders:approve',
  'orders:fulfil',
  'billing:read',
  'billing:manage',
  'sla:read',
  'tickets:read',
  'tickets:create',
  'tickets:escalate',
  'tickets:internal',
  'contracts:read',
  'contracts:renew',
  'documents:read',
  'audit:read'
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  BUSINESS_ADMIN: new Set<Permission>(PERMISSIONS.filter((p) => p !== 'tickets:internal' && p !== 'orders:fulfil')),
  BUSINESS_USER: new Set<Permission>([
    'sites:read',
    'services:read',
    'orders:read',
    'orders:create',
    'billing:read',
    'sla:read',
    'tickets:read',
    'tickets:create',
    'tickets:escalate',
    'contracts:read',
    'documents:read'
  ]),
  SUPPORT_AGENT: new Set<Permission>([
    'sites:read',
    'services:read',
    'users:read',
    'orders:read',
    'orders:fulfil',
    'billing:read',
    'sla:read',
    'tickets:read',
    'tickets:create',
    'tickets:escalate',
    'tickets:internal',
    'contracts:read',
    'documents:read',
    'audit:read'
  ])
};

export interface AuthContext {
  userId: string;
  email: string;
  roles: Role[];
  /** The business account the caller acts on. Support agents may act on any account. */
  accountId: string;
  /**
   * Optional site restriction for BUSINESS_USERs. `null` means all sites on the account.
   */
  siteScope: string[] | null;
}

export function permissionsFor(roles: readonly Role[]): Set<Permission> {
  const result = new Set<Permission>();
  for (const role of roles) {
    for (const p of ROLE_PERMISSIONS[role] ?? []) result.add(p);
  }
  return result;
}

export function can(ctx: Pick<AuthContext, 'roles'>, permission: Permission): boolean {
  return ctx.roles.some((r) => ROLE_PERMISSIONS[r]?.has(permission));
}

export function isAdmin(ctx: Pick<AuthContext, 'roles'>): boolean {
  return ctx.roles.includes('BUSINESS_ADMIN');
}

export function isSupportAgent(ctx: Pick<AuthContext, 'roles'>): boolean {
  return ctx.roles.includes('SUPPORT_AGENT');
}

/** True if the caller may see data belonging to the given site. */
export function canAccessSite(ctx: AuthContext, siteId: string | null | undefined): boolean {
  if (!siteId) return true;
  if (isAdmin(ctx) || isSupportAgent(ctx)) return true;
  return ctx.siteScope === null || ctx.siteScope.includes(siteId);
}

/**
 * Site ids a repository query must be restricted to; `null` means "no restriction".
 */
export function siteFilterFor(ctx: AuthContext): string[] | null {
  if (isAdmin(ctx) || isSupportAgent(ctx)) return null;
  return ctx.siteScope;
}
```

## apps/gokinetic-business/api/src/config/env.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/config/env.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/db/migrate.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/db/migrate.ts`.

```typescript
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool } from './query';
import { logger } from '../lib/logger';

/**
 * Applies forward-only SQL migrations in lexical order, recording each in schema_migrations.
 * Each migration runs in its own transaction; an advisory lock prevents concurrent runners.
 */
async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = createPool(url, 1, 60_000);
  const client = await pool.connect();
  const dir = join(__dirname, 'migrations');
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      logger.info('applying migration', { file });
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    logger.info('migrations complete', { total: files.length });
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error('migration failed', { err });
  process.exit(1);
});
```

## apps/gokinetic-business/api/src/db/migrations/001_initial_schema.sql

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: sql. Path: `apps/gokinetic-business/api/src/db/migrations/001_initial_schema.sql`.

```sql
-- Go Kinetic Business self-care: initial schema
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE accounts (
  id              text PRIMARY KEY CHECK (id ~ '^ACC-[0-9]{8}$'),
  name            text NOT NULL,
  status          text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED', 'CLOSED')),
  currency        char(3) NOT NULL DEFAULT 'GBP',
  sla_tier        text NOT NULL DEFAULT 'STANDARD' CHECK (sla_tier IN ('STANDARD', 'ENHANCED', 'PREMIUM')),
  approval_threshold_minor bigint NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cost_centres (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  code            text NOT NULL,
  name            text NOT NULL,
  monthly_budget_minor bigint,
  active          boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);

CREATE TABLE sites (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  code            text NOT NULL,
  name            text NOT NULL,
  address_line1   text NOT NULL,
  address_line2   text,
  city            text NOT NULL,
  postcode        text NOT NULL,
  country         char(2) NOT NULL DEFAULT 'GB',
  status          text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'DECOMMISSIONED')),
  cost_centre_id  uuid REFERENCES cost_centres(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, code)
);
CREATE INDEX idx_sites_account ON sites(account_id);

CREATE TABLE contracts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  term_months     int NOT NULL CHECK (term_months IN (12, 24, 36, 60)),
  start_date      timestamptz NOT NULL,
  end_date        timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('ACTIVE', 'RENEWED', 'EXPIRED', 'TERMINATED')),
  monthly_commit_minor bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  auto_renew      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contracts_account ON contracts(account_id);

CREATE TABLE services (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  site_id         uuid NOT NULL REFERENCES sites(id),
  contract_id     uuid REFERENCES contracts(id),
  cost_centre_id  uuid REFERENCES cost_centres(id),
  product_code    text NOT NULL,
  product_name    text NOT NULL,
  category        text NOT NULL CHECK (category IN ('BROADBAND', 'VOICE', 'SDWAN', 'HOSTED')),
  bandwidth_mbps  int,
  status          text NOT NULL CHECK (status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'CEASED')),
  sla_tier        text NOT NULL DEFAULT 'STANDARD',
  monthly_charge_minor bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  activated_at    timestamptz,
  ceased_at       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_services_account_site ON services(account_id, site_id);

CREATE TABLE users (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  email           text NOT NULL,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  role            text NOT NULL CHECK (role IN ('BUSINESS_ADMIN', 'BUSINESS_USER')),
  status          text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED')),
  site_scope      uuid[],
  invited_by      uuid,
  last_login_at   timestamptz,
  version         int NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, email)
);

CREATE TABLE order_batches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  created_by      uuid NOT NULL,
  item_count      int NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  batch_id        uuid REFERENCES order_batches(id),
  reference       text NOT NULL UNIQUE,
  order_type      text NOT NULL CHECK (order_type IN ('PROVIDE', 'MOVE', 'ADD', 'CHANGE', 'CEASE')),
  status          text NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED')),
  site_id         uuid NOT NULL REFERENCES sites(id),
  target_site_id  uuid REFERENCES sites(id),
  service_id      uuid REFERENCES services(id),
  product_code    text,
  bandwidth_mbps  int,
  monthly_delta_minor bigint NOT NULL DEFAULT 0,
  one_off_charge_minor bigint NOT NULL DEFAULT 0,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  requires_approval boolean NOT NULL DEFAULT false,
  approved_by     uuid,
  requested_date  date,
  notes           text,
  failure_reason  text,
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_orders_account_status ON orders(account_id, status);

CREATE TABLE order_status_history (
  id              bigserial PRIMARY KEY,
  order_id        uuid NOT NULL REFERENCES orders(id),
  from_status     text,
  to_status       text NOT NULL,
  changed_by      uuid,
  reason          text,
  changed_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invoices (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  number          text NOT NULL UNIQUE,
  period          char(7) NOT NULL,
  issue_date      timestamptz NOT NULL,
  due_date        timestamptz NOT NULL,
  status          text NOT NULL CHECK (status IN ('ISSUED', 'PAID', 'OVERDUE', 'DISPUTED', 'VOID')),
  subtotal_minor  bigint NOT NULL,
  tax_minor       bigint NOT NULL,
  total_minor     bigint NOT NULL,
  currency        char(3) NOT NULL DEFAULT 'GBP',
  UNIQUE (account_id, period)
);

CREATE TABLE invoice_lines (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id      uuid NOT NULL REFERENCES invoices(id),
  service_id      uuid REFERENCES services(id),
  site_id         uuid REFERENCES sites(id),
  description     text NOT NULL,
  category        text NOT NULL,
  amount_minor    bigint NOT NULL,
  cost_centre_id  uuid REFERENCES cost_centres(id)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

CREATE TABLE cost_centre_split_rules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  site_id         uuid NOT NULL REFERENCES sites(id),
  cost_centre_id  uuid NOT NULL REFERENCES cost_centres(id),
  share_bps       int NOT NULL CHECK (share_bps > 0 AND share_bps <= 10000),
  UNIQUE (site_id, cost_centre_id)
);

CREATE TABLE tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  reference       text NOT NULL UNIQUE,
  category        text NOT NULL CHECK (category IN ('FAULT', 'SERVICE_REQUEST', 'BILLING', 'GENERAL')),
  priority        text NOT NULL CHECK (priority IN ('P1', 'P2', 'P3', 'P4')),
  status          text NOT NULL CHECK (status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED')),
  service_id      uuid REFERENCES services(id),
  site_id         uuid REFERENCES sites(id),
  subject         text NOT NULL,
  description     text NOT NULL,
  raised_by       uuid NOT NULL,
  contact_phone   text,
  escalation_level int NOT NULL DEFAULT 0,
  sla_tier        text NOT NULL,
  opened_at       timestamptz NOT NULL DEFAULT now(),
  first_response_at timestamptz,
  resolved_at     timestamptz,
  closed_at       timestamptz,
  pending_since   timestamptz,
  paused_ms       bigint NOT NULL DEFAULT 0,
  response_due_at timestamptz NOT NULL,
  resolution_due_at timestamptz NOT NULL,
  version         int NOT NULL DEFAULT 1
);
CREATE INDEX idx_tickets_account_status ON tickets(account_id, status);

CREATE TABLE ticket_events (
  id              bigserial PRIMARY KEY,
  ticket_id       uuid NOT NULL REFERENCES tickets(id),
  kind            text NOT NULL CHECK (kind IN ('COMMENT', 'STATUS_CHANGE', 'ESCALATION', 'PRIORITY_CHANGE')),
  author_id       uuid,
  body            text,
  from_value      text,
  to_value        text,
  internal        boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE service_outages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id      uuid NOT NULL REFERENCES services(id),
  ticket_id       uuid REFERENCES tickets(id),
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  planned         boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_outages_service_time ON service_outages(service_id, started_at);

CREATE TABLE contract_renewal_quotes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES contracts(id),
  term_months     int NOT NULL,
  discount_bps    int NOT NULL,
  monthly_commit_minor bigint NOT NULL,
  status          text NOT NULL CHECK (status IN ('QUOTED', 'ACCEPTED', 'EXPIRED', 'SUPERSEDED')),
  valid_until     timestamptz NOT NULL,
  accepted_by     uuid,
  accepted_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  kind            text NOT NULL CHECK (kind IN ('INVOICE', 'CONTRACT', 'SLA_REPORT', 'ORDER_FORM', 'SERVICE_SCHEDULE')),
  title           text NOT NULL,
  storage_key     text NOT NULL,
  content_type    text NOT NULL,
  size_bytes      bigint NOT NULL,
  site_id         uuid REFERENCES sites(id),
  related_id      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_documents_account_kind ON documents(account_id, kind);

CREATE TABLE audit_log (
  id              bigserial PRIMARY KEY,
  account_id      text NOT NULL,
  actor_id        uuid,
  action          text NOT NULL,
  entity          text NOT NULL,
  entity_id       text NOT NULL,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_account_time ON audit_log(account_id, created_at DESC);
```

## apps/gokinetic-business/api/src/db/migrations/002_payment_methods_and_outbox.sql

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: sql. Path: `apps/gokinetic-business/api/src/db/migrations/002_payment_methods_and_outbox.sql`.

```sql
-- Payment methods (tokenised; no PAN or full bank account number is ever stored)
CREATE TABLE payment_methods (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id      text NOT NULL REFERENCES accounts(id),
  kind            text NOT NULL CHECK (kind IN ('CARD', 'DIRECT_DEBIT')),
  provider_ref    text NOT NULL,
  holder_name     text NOT NULL,
  card_brand      text CHECK (card_brand IN ('VISA', 'MASTERCARD', 'AMEX')),
  last4           char(4) NOT NULL,
  expiry_month    smallint CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year     smallint,
  sort_code_masked text,
  is_default      boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REMOVED')),
  created_by      uuid NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  removed_at      timestamptz,
  CHECK (kind <> 'CARD' OR (card_brand IS NOT NULL AND expiry_month IS NOT NULL AND expiry_year IS NOT NULL)),
  CHECK (kind <> 'DIRECT_DEBIT' OR sort_code_masked IS NOT NULL)
);
CREATE INDEX idx_payment_methods_account ON payment_methods(account_id) WHERE status = 'ACTIVE';
CREATE UNIQUE INDEX uq_payment_methods_default ON payment_methods(account_id) WHERE is_default AND status = 'ACTIVE';
CREATE UNIQUE INDEX uq_payment_methods_provider_ref ON payment_methods(provider_ref) WHERE status = 'ACTIVE';

-- Transactional outbox for customer notifications (invitations, ticket updates).
-- A separate relay delivers rows and marks them SENT, so a mail outage never rolls back business writes.
CREATE TABLE notification_outbox (
  id              bigserial PRIMARY KEY,
  account_id      text NOT NULL,
  kind            text NOT NULL,
  recipient       text NOT NULL,
  payload         jsonb NOT NULL,
  status          text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENT', 'FAILED')),
  attempts        int NOT NULL DEFAULT 0,
  correlation_id  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);
CREATE INDEX idx_outbox_pending ON notification_outbox(created_at) WHERE status = 'PENDING';

CREATE INDEX idx_audit_account_entity ON audit_log(account_id, entity, created_at DESC);
CREATE INDEX idx_ticket_events_ticket ON ticket_events(ticket_id, created_at);
```

## apps/gokinetic-business/api/src/db/query.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/db/query.ts`.

```typescript
import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logger } from '../lib/logger';
import { ConflictError } from '../lib/errors';

/**
 * Thin query layer over node-postgres. Repositories depend on the `Db` interface
 * so they can run inside or outside a transaction and be replaced by fakes in tests.
 */
export interface Db {
  many<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  oneOrNone<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  one<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T>;
  exec(sql: string, params?: unknown[]): Promise<number>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type Queryable = Pool | PoolClient;

const PG_UNIQUE_VIOLATION = '23505';
const PG_SERIALIZATION_FAILURE = '40001';
const SLOW_QUERY_MS = 250;

function translatePgError(err: unknown): never {
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    throw new ConflictError('A record with the same unique value already exists', {
      constraint: pgErr.constraint
    });
  }
  throw err;
}

class PgDb implements Db {
  constructor(private readonly q: Queryable, private readonly pool: Pool, private readonly inTx: boolean) {}

  private async run<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    const started = Date.now();
    try {
      const result = await this.q.query<T>(sql, params);
      const elapsed = Date.now() - started;
      if (elapsed > SLOW_QUERY_MS) {
        logger.warn('slow query', { elapsedMs: elapsed, sql: sql.slice(0, 200) });
      }
      return result;
    } catch (err) {
      translatePgError(err);
    }
  }

  async many<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
    return (await this.run<T>(sql, params)).rows;
  }

  async oneOrNone<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = (await this.run<T>(sql, params)).rows;
    if (rows.length > 1) throw new Error(`Expected at most one row, got ${rows.length}`);
    return rows[0] ?? null;
  }

  async one<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T> {
    const row = await this.oneOrNone<T>(sql, params);
    if (!row) throw new Error('Expected exactly one row, got none');
    return row;
  }

  async exec(sql: string, params?: unknown[]): Promise<number> {
    return (await this.run(sql, params)).rowCount ?? 0;
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(new PgDb(client, this.pool, true));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code === PG_SERIALIZATION_FAILURE && attempt < maxAttempts) {
          logger.warn('retrying transaction after serialization failure', { attempt });
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
  }
}

export function createPool(url: string, max: number, statementTimeoutMs: number): Pool {
  const pool = new Pool({ connectionString: url, max, statement_timeout: statementTimeoutMs });
  pool.on('error', (err) => logger.error('idle postgres client error', { err }));
  return pool;
}

export function createDb(pool: Pool): Db {
  return new PgDb(pool, pool, false);
}

/** Builds a parameterised WHERE clause from optional filters. */
export class WhereBuilder {
  private readonly clauses: string[] = [];
  readonly params: unknown[] = [];

  add(sqlWithPlaceholder: string, value: unknown): this {
    if (value === undefined || value === null || value === '') return this;
    this.params.push(value);
    this.clauses.push(sqlWithPlaceholder.replace(/\?/g, `$${this.params.length}`));
    return this;
  }

  addRaw(sql: string): this {
    this.clauses.push(sql);
    return this;
  }

  nextParam(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  toSql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}
```

## apps/gokinetic-business/api/src/lib/asyncHandler.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/asyncHandler.ts`.

```typescript
import { NextFunction, Request, RequestHandler, Response } from 'express';

/** Wraps an async controller so rejected promises reach the error middleware. */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
```

## apps/gokinetic-business/api/src/lib/dates.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/dates.ts`.

```typescript
/** Date helpers. All timestamps on the wire are ISO-8601 UTC. */

export const MS_PER_MINUTE = 60_000;
export const MS_PER_HOUR = 60 * MS_PER_MINUTE;
export const MS_PER_DAY = 24 * MS_PER_HOUR;

export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

export function fixedClock(iso: string): Clock {
  const d = new Date(iso);
  return { now: () => new Date(d.getTime()) };
}

export function toIso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

export function addMinutes(d: Date, minutes: number): Date {
  return new Date(d.getTime() + minutes * MS_PER_MINUTE);
}

export function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * MS_PER_DAY);
}

export function addMonthsUtc(d: Date, months: number): Date {
  const result = new Date(d.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

/** Whole months between two dates (floor), UTC calendar based. */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
  if (to.getUTCDate() < from.getUTCDate()) months -= 1;
  return months;
}

export function startOfMonthUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

export function endOfMonthUtc(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 1));
}

/** Parse a billing period "YYYY-MM" into a [start, end) UTC range. */
export function parsePeriod(period: string): { start: Date; end: Date; year: number; month: number } {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  if (!match) throw new RangeError(`Invalid period "${period}", expected YYYY-MM`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  return { start: startOfMonthUtc(year, month), end: endOfMonthUtc(year, month), year, month };
}

/** Length of overlap in ms between [aStart,aEnd) and [bStart,bEnd). */
export function overlapMs(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number {
  const start = Math.max(aStart.getTime(), bStart.getTime());
  const end = Math.min(aEnd.getTime(), bEnd.getTime());
  return Math.max(0, end - start);
}
```

## apps/gokinetic-business/api/src/lib/errors.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/errors.ts`.

```typescript
/**
 * Domain errors mapped to RFC 7807 problem+json responses by the error middleware.
 * Services throw these; controllers never format errors themselves.
 */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
  [extension: string]: unknown;
}

const PROBLEM_BASE = 'https://errors.uniti.example/gokinetic-business';

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly title: string,
    detail?: string,
    readonly extensions: Record<string, unknown> = {}
  ) {
    super(detail ?? title);
    this.name = new.target.name;
  }

  get type(): string {
    return `${PROBLEM_BASE}/${this.code}`;
  }

  toProblem(instance?: string, correlationId?: string): ProblemDetails {
    return {
      type: this.type,
      title: this.title,
      status: this.status,
      detail: this.message,
      instance,
      correlationId,
      ...this.extensions
    };
  }
}

export class ValidationError extends AppError {
  constructor(readonly fieldErrors: Array<{ field: string; message: string }>, detail = 'Request validation failed') {
    super(400, 'validation-error', 'Invalid request', detail, { errors: fieldErrors });
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication is required') {
    super(401, 'unauthorized', 'Unauthorized', detail);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to perform this action') {
    super(403, 'forbidden', 'Forbidden', detail);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id: string) {
    super(404, 'not-found', 'Resource not found', `${resource} ${id} was not found`, { resource, resourceId: id });
  }
}

export class ConflictError extends AppError {
  constructor(detail: string, extensions: Record<string, unknown> = {}) {
    super(409, 'conflict', 'Conflict', detail, extensions);
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(entity: string, from: string, to: string) {
    super(
      409,
      'invalid-state-transition',
      'Invalid state transition',
      `${entity} cannot move from ${from} to ${to}`,
      { entity, from, to }
    );
  }
}

export class BusinessRuleError extends AppError {
  constructor(rule: string, detail: string, extensions: Record<string, unknown> = {}) {
    super(422, `business-rule/${rule}`, 'Business rule violated', detail, { rule, ...extensions });
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
```

## apps/gokinetic-business/api/src/lib/logger.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/logger.ts`.

```typescript
import { AsyncLocalStorage } from 'node:async_hooks';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface RequestContext {
  correlationId: string;
  userId?: string;
  accountId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function currentCorrelationId(): string | undefined {
  return requestContext.getStore()?.correlationId;
}

/** Keys whose values must never reach the log stream. */
const REDACTED_KEYS = new Set(['password', 'authorization', 'token', 'accessToken', 'secret', 'cardNumber']);

function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = REDACTED_KEYS.has(k) ? '[REDACTED]' : redact(v, depth + 1);
  }
  return out;
}

export interface Logger {
  debug(msg: string, fields?: Record<string, unknown>): void;
  info(msg: string, fields?: Record<string, unknown>): void;
  warn(msg: string, fields?: Record<string, unknown>): void;
  error(msg: string, fields?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(
  level: LogLevel = 'info',
  bindings: Record<string, unknown> = {},
  sink: (line: string) => void = (line) => process.stdout.write(line + '\n')
): Logger {
  const threshold = LEVEL_ORDER[level];

  const write = (lvl: LogLevel, msg: string, fields?: Record<string, unknown>): void => {
    if (LEVEL_ORDER[lvl] < threshold) return;
    const ctx = requestContext.getStore();
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      service: 'gokinetic-business-api',
      msg,
      correlationId: ctx?.correlationId,
      userId: ctx?.userId,
      accountId: ctx?.accountId,
      ...bindings,
      ...(fields ? (redact(fields) as Record<string, unknown>) : {})
    };
    sink(JSON.stringify(entry));
  };

  return {
    debug: (m, f) => write('debug', m, f),
    info: (m, f) => write('info', m, f),
    warn: (m, f) => write('warn', m, f),
    error: (m, f) => write('error', m, f),
    child: (extra) => createLogger(level, { ...bindings, ...extra }, sink)
  };
}

export const logger = createLogger((process.env.LOG_LEVEL as LogLevel) ?? 'info');
```

## apps/gokinetic-business/api/src/lib/money.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/money.ts`.

```typescript
/**
 * Money helpers. Amounts are always integer minor units (pence/cents) with an ISO-4217 currency.
 * No floating point arithmetic is used for monetary values.
 */
export type CurrencyCode = 'GBP' | 'EUR' | 'USD';

export interface Money {
  amountMinor: number;
  currency: CurrencyCode;
}

export function money(amountMinor: number, currency: CurrencyCode = 'GBP'): Money {
  if (!Number.isSafeInteger(amountMinor)) {
    throw new RangeError(`Money amount must be a safe integer of minor units, received ${amountMinor}`);
  }
  return { amountMinor, currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor + b.amountMinor, a.currency);
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return money(a.amountMinor - b.amountMinor, a.currency);
}

export function sum(items: Money[], currency: CurrencyCode = 'GBP'): Money {
  return items.reduce((acc, m) => add(acc, m), money(0, currency));
}

/**
 * Multiply by a rational expressed in basis points (1/10,000) using banker's rounding,
 * e.g. 2000 bps = 20%.
 */
export function percentageOf(m: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints)) throw new RangeError('basisPoints must be an integer');
  return money(roundHalfEven((m.amountMinor * basisPoints) / 10_000), m.currency);
}

export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const diff = value - floor;
  const EPS = 1e-9;
  if (diff > 0.5 + EPS) return floor + 1;
  if (diff < 0.5 - EPS) return floor;
  return floor % 2 === 0 ? floor : floor + 1;
}

/**
 * Split an amount across weights so the parts always sum exactly to the total
 * (largest-remainder method). Used for cost-centre allocation.
 */
export function allocateByWeights(total: Money, weights: number[]): Money[] {
  if (weights.length === 0) throw new RangeError('At least one weight is required');
  if (weights.some((w) => !Number.isInteger(w) || w < 0)) {
    throw new RangeError('Weights must be non-negative integers');
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum === 0) throw new RangeError('Weights must not all be zero');

  const sign = total.amountMinor < 0 ? -1 : 1;
  const abs = Math.abs(total.amountMinor);
  const raw = weights.map((w) => (abs * w) / weightSum);
  const floors = raw.map(Math.floor);
  let remainder = abs - floors.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), w: weights[i] }))
    .sort((a, b) => b.frac - a.frac || b.w - a.w || a.i - b.i);

  for (const { i } of order) {
    if (remainder === 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors.map((f) => money(sign * f, total.currency));
}

export function formatMoney(m: Money, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(m.amountMinor / 100);
}
```

## apps/gokinetic-business/api/src/lib/pagination.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/pagination.ts`.

```typescript
import { z } from 'zod';

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

export const PaginationQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE)
});

export type PageRequest = z.infer<typeof PaginationQuery>;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export function toLimitOffset(req: PageRequest): { limit: number; offset: number } {
  return { limit: req.pageSize, offset: (req.page - 1) * req.pageSize };
}

export function pageOf<T>(items: T[], req: PageRequest, total: number): Page<T> {
  return { items, page: req.page, pageSize: req.pageSize, total };
}

export function mapPage<T, U>(page: Page<T>, fn: (item: T) => U): Page<U> {
  return { ...page, items: page.items.map(fn) };
}
```

## apps/gokinetic-business/api/src/lib/references.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/lib/references.ts`.

```typescript
import { randomInt } from 'node:crypto';

/** Crockford base32 without ambiguous characters (I, L, O, U). */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

function randomSuffix(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

function datePart(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export type ReferenceKind = 'ORD' | 'BAT' | 'TKT' | 'CTR';

/** Human-friendly, collision-resistant references, e.g. ORD-20240514-7K3QX9. */
export function newReference(kind: ReferenceKind, now: Date = new Date()): string {
  return `${kind}-${datePart(now)}-${randomSuffix(6)}`;
}
```

## apps/gokinetic-business/api/src/middleware/auth.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/auth.ts`.

```typescript
import { NextFunction, Request, Response } from 'express';
import { TokenVerifier } from '../auth/jwt';
import { AuthContext, Permission, can, isSupportAgent } from '../auth/permissions';
import { ForbiddenError, UnauthorizedError } from '../lib/errors';
import { requestContext } from '../lib/logger';

const ACCOUNT_OVERRIDE_HEADER = 'X-Acting-Account-Id';
const ACCOUNT_ID = /^ACC-\d{8}$/;

/**
 * Verifies the bearer JWT and attaches an AuthContext. Support agents may act on behalf of a
 * customer account using X-Acting-Account-Id; business roles are always pinned to their token account.
 */
export function authenticate(verifier: TokenVerifier) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.header('Authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (scheme?.toLowerCase() !== 'bearer' || !token) {
      return next(new UnauthorizedError('A bearer token is required'));
    }
    try {
      const ctx = verifier.verify(token);
      const acting = req.header(ACCOUNT_OVERRIDE_HEADER);
      if (acting) {
        if (!isSupportAgent(ctx)) {
          throw new ForbiddenError('Only support agents may act on behalf of another account');
        }
        if (!ACCOUNT_ID.test(acting)) throw new UnauthorizedError('X-Acting-Account-Id is malformed');
        ctx.accountId = acting;
      }
      req.auth = ctx;
      const store = requestContext.getStore();
      if (store) {
        store.userId = ctx.userId;
        store.accountId = ctx.accountId;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function requireAuth(req: Request): AuthContext {
  if (!req.auth) throw new UnauthorizedError();
  return req.auth;
}

/** Route-level RBAC guard: the caller must hold every listed permission. */
export function requirePermission(...permissions: Permission[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(new UnauthorizedError());
    const missing = permissions.filter((p) => !can(req.auth!, p));
    if (missing.length > 0) {
      return next(new ForbiddenError(`Missing permission: ${missing.join(', ')}`));
    }
    next();
  };
}
```

## apps/gokinetic-business/api/src/middleware/correlationId.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/correlationId.ts`.

```typescript
import { randomUUID } from 'node:crypto';
import { NextFunction, Request, Response } from 'express';
import { requestContext } from '../lib/logger';

export const CORRELATION_HEADER = 'X-Correlation-Id';
const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Accepts an inbound X-Correlation-Id (if well-formed) or generates one, echoes it on the
 * response and binds it to the async context so every log line carries it.
 */
export function correlationId() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const inbound = req.header(CORRELATION_HEADER);
    const id = inbound && VALID_ID.test(inbound) ? inbound : randomUUID();
    req.correlationId = id;
    res.setHeader(CORRELATION_HEADER, id);
    requestContext.run({ correlationId: id }, () => next());
  };
}
```

## apps/gokinetic-business/api/src/middleware/cors.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/cors.ts`.

```typescript
import { NextFunction, Request, Response } from 'express';
import { CORRELATION_HEADER } from './correlationId';

const ALLOWED_METHODS = 'GET,POST,PUT,PATCH,DELETE,OPTIONS';
const ALLOWED_HEADERS = `Authorization,Content-Type,Accept,${CORRELATION_HEADER},X-Acting-Account-Id`;
const PREFLIGHT_MAX_AGE_SECONDS = 600;

/**
 * Strict allow-list CORS. Only configured origins are reflected; credentials are not used
 * because the portal authenticates with bearer tokens.
 */
export function cors(allowedOrigins: readonly string[]) {
  const allowed = new Set(allowedOrigins);
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.header('Origin');
    if (origin && allowed.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Expose-Headers', `${CORRELATION_HEADER},Location,Content-Disposition`);
      res.append('Vary', 'Origin');
    }
    if (req.method === 'OPTIONS' && req.header('Access-Control-Request-Method')) {
      if (!origin || !allowed.has(origin)) {
        res.status(403).end();
        return;
      }
      res.setHeader('Access-Control-Allow-Methods', ALLOWED_METHODS);
      res.setHeader('Access-Control-Allow-Headers', ALLOWED_HEADERS);
      res.setHeader('Access-Control-Max-Age', String(PREFLIGHT_MAX_AGE_SECONDS));
      res.status(204).end();
      return;
    }
    next();
  };
}
```

## apps/gokinetic-business/api/src/middleware/errorHandler.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/errorHandler.ts`.

```typescript
import { NextFunction, Request, Response } from 'express';
import { AppError, ProblemDetails, isAppError } from '../lib/errors';
import { logger } from '../lib/logger';

const PROBLEM_JSON = 'application/problem+json';

export function notFoundHandler() {
  return (req: Request, res: Response): void => {
    const problem: ProblemDetails = {
      type: 'https://errors.uniti.example/gokinetic-business/route-not-found',
      title: 'Route not found',
      status: 404,
      detail: `No route for ${req.method} ${req.path}`,
      instance: req.originalUrl,
      correlationId: req.correlationId
    };
    res.status(404).type(PROBLEM_JSON).json(problem);
  };
}

/**
 * Final error middleware: maps domain errors to RFC 7807 responses, hides internals for
 * unexpected failures, and always includes the correlation id for support diagnostics.
 */
export function errorHandler() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    if (isBodyParserError(err)) {
      const problem: ProblemDetails = {
        type: 'https://errors.uniti.example/gokinetic-business/malformed-body',
        title: 'Malformed request body',
        status: 400,
        detail: 'The request body is not valid JSON',
        instance: req.originalUrl,
        correlationId: req.correlationId
      };
      res.status(400).type(PROBLEM_JSON).json(problem);
      return;
    }

    if (isAppError(err)) {
      logAppError(err, req);
      res.status(err.status).type(PROBLEM_JSON).json(err.toProblem(req.originalUrl, req.correlationId));
      return;
    }

    logger.error('unhandled error', { err, method: req.method, path: req.path });
    const problem: ProblemDetails = {
      type: 'https://errors.uniti.example/gokinetic-business/internal',
      title: 'Internal server error',
      status: 500,
      detail: 'An unexpected error occurred. Quote the correlation id when contacting support.',
      instance: req.originalUrl,
      correlationId: req.correlationId
    };
    res.status(500).type(PROBLEM_JSON).json(problem);
  };
}

function logAppError(err: AppError, req: Request): void {
  const fields = { code: err.code, status: err.status, method: req.method, path: req.path, detail: err.message };
  if (err.status >= 500) logger.error('request failed', fields);
  else if (err.status === 401 || err.status === 403) logger.warn('access denied', fields);
  else logger.info('request rejected', fields);
}

function isBodyParserError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  );
}
```

## apps/gokinetic-business/api/src/middleware/requestLogger.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/requestLogger.ts`.

```typescript
import { NextFunction, Request, Response } from 'express';
import { logger } from '../lib/logger';

/** Emits one structured access-log line per request once the response has finished. */
export function requestLogger() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const fields = {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userAgent: req.header('User-Agent')
      };
      if (res.statusCode >= 500) logger.error('http request', fields);
      else logger.info('http request', fields);
    });
    next();
  };
}
```

## apps/gokinetic-business/api/src/middleware/validate.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/middleware/validate.ts`.

```typescript
import { NextFunction, Request, Response } from 'express';
import { ZodError, ZodTypeAny, z } from 'zod';
import { ValidationError } from '../lib/errors';

export function zodToValidationError(err: ZodError, location: string): ValidationError {
  return new ValidationError(
    err.issues.map((issue) => ({
      field: [location, ...issue.path].join('.'),
      message: issue.message
    }))
  );
}

export function parseOrThrow<S extends ZodTypeAny>(schema: S, value: unknown, location = 'body'): z.infer<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw zodToValidationError(result.error, location);
  return result.data;
}

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

/**
 * Validates and normalises request parts in place. Controllers can then read
 * `res.locals.query` / `req.body` / `req.params` already coerced to the schema types.
 */
export function validate(schemas: Schemas) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.params) req.params = parseOrThrow(schemas.params, req.params, 'params');
      if (schemas.query) res.locals.query = parseOrThrow(schemas.query, req.query, 'query');
      if (schemas.body) req.body = parseOrThrow(schemas.body, req.body ?? {}, 'body');
      next();
    } catch (err) {
      next(err);
    }
  };
}

export const UuidParam = z.object({ id: z.string().uuid('id must be a UUID') });
```

## apps/gokinetic-business/api/src/modules/accounts/accounts.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/accounts/accounts.repository.ts`.

```typescript
import { Db } from '../../db/query';
import { NotFoundError } from '../../lib/errors';
import { SlaTier } from '../inventory/inventory.types';

export interface Account {
  id: string;
  name: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'CLOSED';
  currency: string;
  slaTier: SlaTier;
  /** Orders whose annualised impact exceeds this need admin approval; 0 disables approvals. */
  approvalThresholdMinor: number;
}

interface AccountRow {
  id: string;
  name: string;
  status: Account['status'];
  currency: string;
  sla_tier: SlaTier;
  approval_threshold_minor: string;
}

export interface AccountsRepository {
  get(accountId: string): Promise<Account>;
  updateApprovalThreshold(accountId: string, thresholdMinor: number): Promise<Account>;
}

function toAccount(r: AccountRow): Account {
  return {
    id: r.id,
    name: r.name,
    status: r.status,
    currency: r.currency,
    slaTier: r.sla_tier,
    approvalThresholdMinor: Number(r.approval_threshold_minor)
  };
}

export function createAccountsRepository(db: Db): AccountsRepository {
  return {
    async get(accountId) {
      const row = await db.oneOrNone<AccountRow>('SELECT * FROM accounts WHERE id = $1', [accountId]);
      if (!row) throw new NotFoundError('Account', accountId);
      return toAccount(row);
    },

    async updateApprovalThreshold(accountId, thresholdMinor) {
      const row = await db.oneOrNone<AccountRow>(
        'UPDATE accounts SET approval_threshold_minor = $2 WHERE id = $1 RETURNING *',
        [accountId, thresholdMinor]
      );
      if (!row) throw new NotFoundError('Account', accountId);
      return toAccount(row);
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/accounts/accounts.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/accounts/accounts.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AccountsService, MAX_APPROVAL_THRESHOLD_MINOR } from './accounts.service';

const ThresholdBody = z.object({
  approvalThresholdMinor: z.number().int().min(0).max(MAX_APPROVAL_THRESHOLD_MINOR)
});

export function accountsRoutes(service: AccountsService): Router {
  const router = Router();

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await service.me(requireAuth(req)));
    })
  );

  router.get(
    '/account',
    requirePermission('sites:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req)));
    })
  );

  router.put(
    '/account/approval-threshold',
    requirePermission('orders:approve'),
    validate({ body: ThresholdBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateApprovalThreshold(requireAuth(req), req.body.approvalThresholdMinor));
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/accounts/accounts.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/accounts/accounts.service.test.ts`.

```typescript
import { BusinessRuleError, ForbiddenError } from '../../lib/errors';
import { ACCOUNT_ID, adminCtx, passthroughDb, recordingAudit, userCtx } from '../../test/fixtures';
import { Account, AccountsRepository } from './accounts.repository';
import { AccountsService, MAX_APPROVAL_THRESHOLD_MINOR } from './accounts.service';

function makeAccount(overrides: Partial<Account> = {}): Account {
  return { id: ACCOUNT_ID, name: 'Acme Ltd', status: 'ACTIVE', currency: 'GBP', slaTier: 'ENHANCED', approvalThresholdMinor: 100_000, ...overrides };
}

function setup(account = makeAccount()) {
  const repo: jest.Mocked<AccountsRepository> = {
    get: jest.fn(async () => account),
    updateApprovalThreshold: jest.fn(async (_id, threshold) => ({ ...account, approvalThresholdMinor: threshold }))
  };
  const audit = recordingAudit();
  return { repo, audit, service: new AccountsService(passthroughDb(), repo, audit) };
}

describe('AccountsService.me', () => {
  it('returns derived permissions for a business user', async () => {
    const { service } = setup();
    const me = await service.me(userCtx());
    expect(me.permissions).toContain('orders:create');
    expect(me.permissions).not.toContain('users:manage');
    expect(me.account.name).toBe('Acme Ltd');
    expect(me.siteScope).toEqual(userCtx().siteScope);
  });
});

describe('AccountsService.updateApprovalThreshold', () => {
  it('updates and audits the change', async () => {
    const { service, audit } = setup();
    const updated = await service.updateApprovalThreshold(adminCtx(), 250_000);
    expect(updated.approvalThresholdMinor).toBe(250_000);
    expect(audit.entries[0]).toMatchObject({ action: 'account.approval_threshold_changed', details: { from: 100_000, to: 250_000 } });
  });

  it('is a no-op when the value is unchanged', async () => {
    const { service, repo, audit } = setup();
    await service.updateApprovalThreshold(adminCtx(), 100_000);
    expect(repo.updateApprovalThreshold).not.toHaveBeenCalled();
    expect(audit.entries).toHaveLength(0);
  });

  it('rejects non-admins and out-of-range values', async () => {
    const { service } = setup();
    await expect(service.updateApprovalThreshold(userCtx(), 1)).rejects.toThrow(ForbiddenError);
    await expect(service.updateApprovalThreshold(adminCtx(), MAX_APPROVAL_THRESHOLD_MINOR + 1)).rejects.toThrow(BusinessRuleError);
    await expect(service.updateApprovalThreshold(adminCtx(), 10.5)).rejects.toThrow(BusinessRuleError);
  });

  it('refuses to modify a closed account', async () => {
    const { service } = setup(makeAccount({ status: 'CLOSED' }));
    await expect(service.updateApprovalThreshold(adminCtx(), 5)).rejects.toThrow(/Closed accounts/);
  });
});
```

## apps/gokinetic-business/api/src/modules/accounts/accounts.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/accounts/accounts.service.ts`.

```typescript
import { AuthContext, Permission, isAdmin, permissionsFor } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, ForbiddenError } from '../../lib/errors';
import { AuditRepository } from '../audit/audit.repository';
import { Account, AccountsRepository } from './accounts.repository';

/** Upper bound for the order approval threshold (annualised impact), £250,000. */
export const MAX_APPROVAL_THRESHOLD_MINOR = 25_000_000;

export interface Me {
  userId: string;
  email: string;
  roles: AuthContext['roles'];
  accountId: string;
  siteScope: string[] | null;
  permissions: Permission[];
  account: Pick<Account, 'id' | 'name' | 'status' | 'slaTier' | 'currency'>;
}

export class AccountsService {
  constructor(
    private readonly db: Db,
    private readonly repo: AccountsRepository,
    private readonly audit: AuditRepository
  ) {}

  /** Session bootstrap for the portal: who am I, what can I do, and on which account. */
  async me(ctx: AuthContext): Promise<Me> {
    const account = await this.repo.get(ctx.accountId);
    return {
      userId: ctx.userId,
      email: ctx.email,
      roles: ctx.roles,
      accountId: ctx.accountId,
      siteScope: ctx.siteScope,
      permissions: [...permissionsFor(ctx.roles)].sort(),
      account: { id: account.id, name: account.name, status: account.status, slaTier: account.slaTier, currency: account.currency }
    };
  }

  get(ctx: AuthContext): Promise<Account> {
    return this.repo.get(ctx.accountId);
  }

  /**
   * Sets the annualised spend above which a BUSINESS_USER's order needs admin approval.
   * Zero disables approvals entirely.
   */
  async updateApprovalThreshold(ctx: AuthContext, thresholdMinor: number): Promise<Account> {
    if (!isAdmin(ctx)) throw new ForbiddenError('Only business admins can change the approval threshold');
    if (!Number.isSafeInteger(thresholdMinor) || thresholdMinor < 0 || thresholdMinor > MAX_APPROVAL_THRESHOLD_MINOR) {
      throw new BusinessRuleError('approval-threshold-range', `Threshold must be between 0 and ${MAX_APPROVAL_THRESHOLD_MINOR} minor units`);
    }
    return this.db.tx(async (tx) => {
      const before = await this.repo.get(ctx.accountId);
      if (before.status === 'CLOSED') throw new BusinessRuleError('account-closed', 'Closed accounts cannot be modified');
      if (before.approvalThresholdMinor === thresholdMinor) return before;
      const updated = await this.repo.updateApprovalThreshold(ctx.accountId, thresholdMinor);
      await this.audit.record(
        {
          accountId: ctx.accountId,
          actorId: ctx.userId,
          action: 'account.approval_threshold_changed',
          entity: 'account',
          entityId: ctx.accountId,
          details: { from: before.approvalThresholdMinor, to: thresholdMinor }
        },
        tx
      );
      return updated;
    });
  }
}
```

## apps/gokinetic-business/api/src/modules/audit/audit.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/audit/audit.repository.ts`.

```typescript
import { Db } from '../../db/query';
import { currentCorrelationId } from '../../lib/logger';
import { PageRequest, Page, pageOf, toLimitOffset } from '../../lib/pagination';

export interface AuditEntry {
  accountId: string;
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
}

export interface AuditRecord extends Required<AuditEntry> {
  id: number;
  correlationId: string | null;
  createdAt: string;
}

interface AuditRow {
  id: string;
  account_id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string;
  details: Record<string, unknown>;
  correlation_id: string | null;
  created_at: Date;
  total?: string;
}

export interface AuditRepository {
  record(entry: AuditEntry, db?: Db): Promise<void>;
  list(accountId: string, filter: { entity?: string; actorId?: string }, page: PageRequest): Promise<Page<AuditRecord>>;
}

export function createAuditRepository(defaultDb: Db): AuditRepository {
  return {
    async record(entry, db = defaultDb) {
      await db.exec(
        `INSERT INTO audit_log (account_id, actor_id, action, entity, entity_id, details, correlation_id)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
        [
          entry.accountId,
          entry.actorId,
          entry.action,
          entry.entity,
          entry.entityId,
          JSON.stringify(entry.details ?? {}),
          currentCorrelationId() ?? null
        ]
      );
    },

    async list(accountId, filter, page) {
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<AuditRow>(
        `SELECT *, count(*) OVER() AS total FROM audit_log
          WHERE account_id = $1
            AND ($2::text IS NULL OR entity = $2)
            AND ($3::uuid IS NULL OR actor_id = $3)
          ORDER BY created_at DESC
          LIMIT $4 OFFSET $5`,
        [accountId, filter.entity ?? null, filter.actorId ?? null, limit, offset]
      );
      const total = rows.length ? Number(rows[0].total) : 0;
      return pageOf(
        rows.map((r) => ({
          id: Number(r.id),
          accountId: r.account_id,
          actorId: r.actor_id,
          action: r.action,
          entity: r.entity,
          entityId: r.entity_id,
          details: r.details,
          correlationId: r.correlation_id,
          createdAt: r.created_at.toISOString()
        })),
        page,
        total
      );
    }
  };
}
```
