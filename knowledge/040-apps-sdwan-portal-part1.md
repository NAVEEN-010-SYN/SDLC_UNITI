# SD-WAN management (VeloCloud & Fortinet): apps/sdwan-portal (part 1 of 7)

- **Application:** SD-WAN management (VeloCloud & Fortinet)
- **Tech stack:** Node.js TypeScript API + React
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 20

## Files

- `apps/sdwan-portal/README.md` (65 lines)
- `apps/sdwan-portal/api/.env.example` (49 lines)
- `apps/sdwan-portal/api/Dockerfile` (21 lines)
- `apps/sdwan-portal/api/jest.config.js` (12 lines)
- `apps/sdwan-portal/api/package.json` (37 lines)
- `apps/sdwan-portal/api/src/app.test.ts` (93 lines)
- `apps/sdwan-portal/api/src/app.ts` (71 lines)
- `apps/sdwan-portal/api/src/auth/jwt.ts` (94 lines)
- `apps/sdwan-portal/api/src/auth/rbac.ts` (99 lines)
- `apps/sdwan-portal/api/src/cache/TtlCache.ts` (90 lines)
- `apps/sdwan-portal/api/src/config/env.ts` (89 lines)
- `apps/sdwan-portal/api/src/container.ts` (78 lines)
- `apps/sdwan-portal/api/src/domain/approvalRules.ts` (177 lines)
- `apps/sdwan-portal/api/src/domain/cidr.ts` (112 lines)
- `apps/sdwan-portal/api/src/domain/configDiff.ts` (105 lines)
- `apps/sdwan-portal/api/src/domain/firewallLint.ts` (150 lines)
- `apps/sdwan-portal/api/src/domain/linkScoring.ts` (151 lines)
- `apps/sdwan-portal/api/src/domain/maintenanceWindows.ts` (120 lines)
- `apps/sdwan-portal/api/src/domain/metricsAggregation.ts` (182 lines)
- `apps/sdwan-portal/api/src/domain/policyTranslation.ts` (178 lines)

## apps/sdwan-portal/README.md

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: markdown. Path: `apps/sdwan-portal/README.md`.

````markdown
# SD-WAN Portal

B2B self-care for managed SD-WAN customers. One vendor-neutral model fronts two
very different control planes:

| Vendor | Control plane | Transport used here |
|---|---|---|
| VMware VeloCloud | VeloCloud Orchestrator (VCO) | Portal API `POST /portal/rest/<method>` with session cookie |
| Fortinet | FortiManager + FortiGate | FortiManager JSON-RPC (`/jsonrpc`, session token) and FortiGate REST (`/api/v2/...`, API key) |

```
apps/sdwan-portal
├── api/   Node.js + Express (TypeScript) – adapters, services, jobs, REST API
└── web/   React + Vite (TypeScript) – customer dashboard
```

## Capabilities

* **Inventory** – sites, edges and WAN links per Account, normalised across vendors.
* **Health** – latency / jitter / loss per link, polled on a schedule, aggregated into
  percentiles and scored (MOS-style link score, SLA compliance %).
* **Business policies / QoS** – one neutral policy model translated to VeloCloud QoS
  rules and FortiGate SD-WAN service rules (and back).
* **Firewall rules** – neutral rule list, shadowing/overlap lint, vendor translation.
* **Change requests** – risk-scored, approval workflow (no self-approval, role quorum
  by risk), scheduling into maintenance windows, automatic pre-change backup.
* **Config backup / rollback** – checksummed snapshots, structural diff, restore via CR.
* **Alerts & events** – threshold alerts raised from metrics, vendor events merged.
* **Reports** – SLA/availability per site for a period, CSV export.

## Architecture (api)

```
routes/        HTTP boundary: validation (zod), RBAC, problem+json
services/      business logic (inventory, health, policies, change requests, ...)
domain/        pure logic: scoring, aggregation, policy translation, approval rules
providers/     SdwanProvider interface + VeloCloudAdapter / FortinetAdapter
  http/        HttpClient with retry, exponential backoff + jitter, timeouts
repositories/  persistence interfaces + in-memory implementations
jobs/          interval scheduler: metric polling, alert evaluation, CR execution
```

Roles (from `CONVENTIONS.md`): `BUSINESS_ADMIN`, `BUSINESS_USER`, `SUPPORT_AGENT`,
`PARTNER_ADMIN`. Business users are scoped to their `accountId` claim; support
agents may act on any account.

## Running locally

```bash
cd api && npm install && cp .env.example .env && npm run dev     # :8080
cd web && npm install && npm run dev                              # :5173, proxies /api
```

Set `SDWAN_PROVIDER_MODE=mock` in `api/.env` to run without vendor credentials –
the adapters are then backed by deterministic in-memory fixtures and demo account
`ACC-10000001` (one VeloCloud and one Fortinet tenant). In live mode map accounts to
controller tenants with `SDWAN_TENANTS=ACC-########:VELOCLOUD|FORTINET:<tenant>,...`.

## Tests

```bash
cd api && npm test        # Jest: services, vendor clients (scripted fetch), validation, scheduler, routes (supertest)
cd web && npm test        # Vitest + Testing Library: API client, token gating, drafts, components, pages
```
````

## apps/sdwan-portal/api/.env.example

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: bash. Path: `apps/sdwan-portal/api/.env.example`.

```bash
# --- HTTP ---
PORT=8080
LOG_LEVEL=info
CORS_ORIGINS=http://localhost:5173

# --- Auth (OIDC-issued JWT) ---
JWT_ISSUER=https://login.example-uniti.net/realms/selfcare
JWT_AUDIENCE=sdwan-portal
# HS256 shared secret for local dev OR an RS256 public key (PEM, \n-escaped) for real IdPs
JWT_SECRET=change-me-local-only
JWT_PUBLIC_KEY=

# --- Provider mode: "live" talks to vendors, "mock" uses deterministic fixtures ---
SDWAN_PROVIDER_MODE=mock

# --- VMware VeloCloud Orchestrator ---
VCO_BASE_URL=https://vco.example.net
VCO_USERNAME=
VCO_PASSWORD=
VCO_TIMEOUT_MS=15000

# --- Fortinet ---
FMG_BASE_URL=https://fortimanager.example.net
FMG_USERNAME=
FMG_PASSWORD=
FMG_ADOM_DEFAULT=root
FMG_POLICY_PACKAGE=default
FGT_API_TOKEN=
FGT_VERIFY_TLS=true
FORTI_TIMEOUT_MS=15000

# --- HTTP client resilience ---
HTTP_MAX_RETRIES=3
HTTP_BACKOFF_BASE_MS=250
HTTP_BACKOFF_MAX_MS=5000

# --- Jobs ---
METRICS_POLL_INTERVAL_SEC=300
ALERT_EVAL_INTERVAL_SEC=60
CHANGE_EXECUTOR_INTERVAL_SEC=60
METRICS_RETENTION_HOURS=168

# --- Cache ---
INVENTORY_CACHE_TTL_SEC=120

# --- Account -> controller tenant directory (ACC-########:VELOCLOUD|FORTINET:<tenant>, comma-separated) ---
# Empty in mock mode uses the built-in demo account ACC-10000001.
SDWAN_TENANTS=
```

## apps/sdwan-portal/api/Dockerfile

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: dockerfile. Path: `apps/sdwan-portal/api/Dockerfile`.

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
COPY package.json ./
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["node", "dist/server.js"]
```

## apps/sdwan-portal/api/jest.config.js

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: javascript. Path: `apps/sdwan-portal/api/jest.config.js`.

```javascript
/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.test.ts', '!src/server.ts', '!src/testing/**'],
  coverageThreshold: {
    global: { branches: 70, functions: 75, lines: 80, statements: 80 },
  },
};
```

## apps/sdwan-portal/api/package.json

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: json. Path: `apps/sdwan-portal/api/package.json`.

```json
{
  "name": "@uniti/sdwan-portal-api",
  "version": "1.0.0",
  "private": true,
  "description": "SD-WAN self-care API (VeloCloud + Fortinet) for the Uniti Self-Care Platform",
  "main": "dist/server.js",
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "dev": "ts-node-dev --respawn --transpile-only src/server.ts",
    "start": "node dist/server.js",
    "test": "jest",
    "test:coverage": "jest --coverage",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "express": "^4.19.2",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/jest": "^29.5.12",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.12.7",
    "@types/supertest": "^6.0.2",
    "jest": "^29.7.0",
    "supertest": "^7.0.0",
    "ts-jest": "^29.1.2",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.4.5"
  },
  "engines": {
    "node": ">=20"
  }
}
```

## apps/sdwan-portal/api/src/app.test.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/app.test.ts`.

```typescript
import request from 'supertest';
import { createApp } from './app';
import { signDevToken } from './auth/jwt';
import { ACCOUNT, createHarness, HA_EDGE, Harness, OTHER_ACCOUNT } from './testing/harness';

describe('HTTP API', () => {
  let h: Harness;
  let app: ReturnType<typeof createApp>;
  const base = `/api/v1/accounts/${ACCOUNT}`;
  const as = (role: 'BUSINESS_USER' | 'BUSINESS_ADMIN' | 'PARTNER_AGENT', userId = `u-${role.toLowerCase()}`) =>
    `Bearer ${h.token(userId, role)}`;

  beforeEach(() => {
    h = createHarness();
    app = createApp(h.c);
  });

  it('returns RFC 7807 problems and echoes the correlation id', async () => {
    const res = await request(app).get(`${base}/edges`).set('X-Correlation-Id', 'trace-abcdef12');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.headers['x-correlation-id']).toBe('trace-abcdef12');
    expect(res.body).toMatchObject({ type: expect.stringMatching(/\/unauthorized$/), status: 401, correlationId: 'trace-abcdef12' });
  });

  it('scopes business users to their own account and validates the account id', async () => {
    expect((await request(app).get(`/api/v1/accounts/${OTHER_ACCOUNT}/edges`).set('Authorization', as('BUSINESS_USER'))).status).toBe(403);
    const bad = await request(app).get('/api/v1/accounts/not-an-account/edges').set('Authorization', as('BUSINESS_USER'));
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].message).toMatch(/ACC-/);
  });

  it('paginates and filters edges across both vendors', async () => {
    const all = await request(app).get(`${base}/edges?pageSize=2`).set('Authorization', as('BUSINESS_USER'));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 6 });
    expect(all.body.items).toHaveLength(2);

    const forti = await request(app).get(`${base}/edges?vendor=FORTINET`).set('Authorization', as('BUSINESS_USER'));
    expect(forti.body.items.every((e: { vendor: string }) => e.vendor === 'FORTINET')).toBe(true);
    expect((await request(app).get(`${base}/edges?status=SIDEWAYS`).set('Authorization', as('BUSINESS_USER'))).status).toBe(400);
  });

  it('serves edge health with series and a 404 problem for unknown edges', async () => {
    const res = await request(app)
      .get(`${base}/edges/${HA_EDGE}/health?from=2026-03-02T08:00:00Z&to=2026-03-02T10:00:00Z`)
      .set('Authorization', as('BUSINESS_USER'));
    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(2);
    expect(res.body.links[0].series.length).toBeGreaterThan(0);
    expect((await request(app).get(`${base}/edges/nope/health`).set('Authorization', as('BUSINESS_USER'))).status).toBe(404);
  });

  it('lets users raise change requests but only admins approve them', async () => {
    const created = await request(app)
      .post(`${base}/change-requests`)
      .set('Authorization', as('BUSINESS_USER'))
      .send({ title: 'Reboot head office edge', edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`${base}/change-requests/${created.body.id}`);

    const decision = { decision: 'APPROVE' };
    const byUser = await request(app).post(`${base}/change-requests/${created.body.id}/decisions`).set('Authorization', as('BUSINESS_USER', 'u-peer')).send(decision);
    expect(byUser.status).toBe(403);
    const byAdmin = await request(app).post(`${base}/change-requests/${created.body.id}/decisions`).set('Authorization', as('BUSINESS_ADMIN')).send(decision);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.status).toBe('APPROVED');

    const list = await request(app).get(`${base}/change-requests?status=APPROVED`).set('Authorization', as('BUSINESS_USER'));
    expect(list.body.total).toBe(1);
  });

  it('restricts partner agents to read-only operational views', async () => {
    expect((await request(app).get(`/api/v1/accounts/${ACCOUNT}/alerts`).set('Authorization', `Bearer ${partnerToken(h)}`)).status).toBe(200);
    expect((await request(app).get(`${base}/edges/${HA_EDGE}/policies`).set('Authorization', `Bearer ${partnerToken(h)}`)).status).toBe(403);
  });

  it('exports the SLA report as CSV and rejects malformed JSON', async () => {
    const csv = await request(app).get(`${base}/reports/sla?period=2026-03&format=csv`).set('Authorization', as('BUSINESS_USER'));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toMatch(/^siteName,edgeName,vendor/);

    const bad = await request(app).post(`${base}/change-requests`).set('Authorization', as('BUSINESS_USER')).set('Content-Type', 'application/json').send('{"title":');
    expect(bad.status).toBe(400);
    expect(bad.body.type).toMatch(/malformed-json$/);
  });
});

function partnerToken(h: Harness): string {
  return signDevToken({ userId: 'p-agent', roles: ['PARTNER_AGENT'], partnerAccountIds: [ACCOUNT] }, h.c.jwt);
}
```

## apps/sdwan-portal/api/src/app.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/app.ts`.

```typescript
import express, { Express, RequestHandler, Router } from 'express';
import helmet from 'helmet';
import { authenticate } from './auth/jwt';
import { principalOf, requireAccountAccess } from './auth/rbac';
import type { Container } from './container';
import { notFoundHandler, problemHandler } from './errors/problem';
import { accessLog, cors, correlationId } from './http/middleware';
import type { JobStatus } from './jobs/Scheduler';
import { changeRoutes } from './routes/changeRoutes';
import { configRoutes } from './routes/configRoutes';
import { inventoryRoutes } from './routes/inventoryRoutes';
import { operationsRoutes } from './routes/operationsRoutes';
import { accountIdParam } from './validation/schemas';
import { parse } from './validation/validate';

export interface AppOptions {
  corsOrigins?: string[];
  jobStatus?: () => JobStatus[];
}

const validateAccountId: RequestHandler = (req, _res, next) => {
  try {
    parse(accountIdParam, req.params.accountId);
    next();
  } catch (err) {
    next(err);
  }
};

export function createApp(c: Container, opts: AppOptions = {}): Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(correlationId);
  app.use(helmet());
  app.use(cors(opts.corsOrigins ?? []));
  app.use(accessLog(c.logger));
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/readyz', async (_req, res) => {
    const vendors = await c.providers.health().catch(() => ({}) as Record<string, boolean>);
    const ok = Object.values(vendors).length > 0 && Object.values(vendors).every(Boolean);
    res.status(ok ? 200 : 503).json({ status: ok ? 'ready' : 'degraded', vendors, jobs: opts.jobStatus?.() ?? [] });
  });

  const v1 = Router();
  v1.use(authenticate(c.jwt));

  v1.get('/me', (_req, res) => {
    const p = principalOf(res.locals);
    res.json({ userId: p.userId, roles: p.roles, accountId: p.accountId ?? null, partnerAccountIds: p.partnerAccountIds ?? [] });
  });

  const account = Router({ mergeParams: true });
  account.use(validateAccountId, requireAccountAccess);
  account.use('/', inventoryRoutes(c));
  account.use('/', configRoutes(c));
  account.use('/', operationsRoutes(c));
  account.use('/change-requests', changeRoutes(c));
  v1.use('/accounts/:accountId', account);

  app.use('/api/v1', v1);
  app.use(notFoundHandler);
  app.use(problemHandler(c.logger));
  return app;
}
```

## apps/sdwan-portal/api/src/auth/jwt.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/auth/jwt.ts`.

```typescript
import type { RequestHandler } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';
import type { Principal, Role } from '../domain/types';
import { UnauthorizedProblem } from '../errors/problem';
import { requestContext } from '../logging/logger';

export interface JwtSettings {
  issuer: string;
  audience: string;
  secret?: string;
  publicKey?: string;
  clockToleranceSec?: number;
}

const KNOWN_ROLES: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER', 'SUPPORT_AGENT', 'PARTNER_ADMIN', 'PARTNER_AGENT'];
const ACCOUNT_ID = /^ACC-\d{8}$/;

/**
 * Roles may arrive as a flat `roles` claim or Keycloak-style `realm_access.roles`.
 * Unknown roles are ignored rather than rejected so the IdP can carry roles for
 * other portals in the same token.
 */
export function extractRoles(payload: JwtPayload): Role[] {
  const raw: unknown[] = [
    ...(Array.isArray(payload.roles) ? payload.roles : []),
    ...(Array.isArray(payload.realm_access?.roles) ? payload.realm_access.roles : []),
  ];
  return [...new Set(raw.filter((r): r is Role => typeof r === 'string' && KNOWN_ROLES.includes(r as Role)))];
}

export function payloadToPrincipal(payload: JwtPayload): Principal {
  if (!payload.sub) throw new UnauthorizedProblem('Token has no subject');
  const roles = extractRoles(payload);
  if (roles.length === 0) throw new UnauthorizedProblem('Token carries no SD-WAN portal role');
  const accountId = typeof payload.accountId === 'string' ? payload.accountId : undefined;
  if (accountId && !ACCOUNT_ID.test(accountId)) throw new UnauthorizedProblem('Token accountId claim is malformed');
  if (!roles.includes('SUPPORT_AGENT') && !accountId && !roles.some((r) => r.startsWith('PARTNER_'))) {
    throw new UnauthorizedProblem('Business users must carry an accountId claim');
  }
  const partnerAccountIds = Array.isArray(payload.partnerAccountIds)
    ? payload.partnerAccountIds.filter((a: unknown): a is string => typeof a === 'string' && ACCOUNT_ID.test(a))
    : undefined;
  return { userId: payload.sub, roles, accountId, partnerAccountIds };
}

export function verifyToken(token: string, settings: JwtSettings): Principal {
  const key = settings.publicKey ? settings.publicKey.replace(/\\n/g, '\n') : settings.secret;
  if (!key) throw new Error('JWT verification key not configured');
  let payload: string | JwtPayload;
  try {
    payload = jwt.verify(token, key, {
      issuer: settings.issuer,
      audience: settings.audience,
      algorithms: settings.publicKey ? ['RS256', 'ES256'] : ['HS256'],
      clockTolerance: settings.clockToleranceSec ?? 30,
    });
  } catch (err) {
    const name = (err as Error).name;
    throw new UnauthorizedProblem(name === 'TokenExpiredError' ? 'Token has expired' : 'Token is invalid');
  }
  if (typeof payload === 'string') throw new UnauthorizedProblem('Token payload must be a JSON object');
  return payloadToPrincipal(payload);
}

export function authenticate(settings: JwtSettings): RequestHandler {
  return (req, res, next) => {
    try {
      const header = req.headers.authorization ?? '';
      const [scheme, token] = header.split(' ');
      if (scheme?.toLowerCase() !== 'bearer' || !token) throw new UnauthorizedProblem();
      const principal = verifyToken(token, settings);
      res.locals.principal = principal;
      const ctx = requestContext.getStore();
      if (ctx) {
        ctx.userId = principal.userId;
        ctx.accountId = principal.accountId;
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Test/dev helper: issues an HS256 token with the same claim layout as the IdP. */
export function signDevToken(principal: Principal, settings: JwtSettings, expiresInSec = 3600): string {
  if (!settings.secret) throw new Error('signDevToken requires an HS256 secret');
  return jwt.sign(
    { roles: principal.roles, accountId: principal.accountId, partnerAccountIds: principal.partnerAccountIds },
    settings.secret,
    { subject: principal.userId, issuer: settings.issuer, audience: settings.audience, expiresIn: expiresInSec, algorithm: 'HS256' },
  );
}
```

## apps/sdwan-portal/api/src/auth/rbac.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/auth/rbac.ts`.

```typescript
import type { RequestHandler } from 'express';
import type { Principal, Role } from '../domain/types';
import { ForbiddenProblem, UnauthorizedProblem } from '../errors/problem';

export type Permission =
  | 'inventory:read'
  | 'health:read'
  | 'policy:read'
  | 'firewall:read'
  | 'change:read'
  | 'change:create'
  | 'change:approve'
  | 'change:execute'
  | 'backup:read'
  | 'backup:create'
  | 'maintenance:read'
  | 'maintenance:write'
  | 'alert:read'
  | 'alert:manage'
  | 'report:read';

const READ_ALL: Permission[] = [
  'inventory:read',
  'health:read',
  'policy:read',
  'firewall:read',
  'change:read',
  'backup:read',
  'maintenance:read',
  'alert:read',
  'report:read',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  BUSINESS_ADMIN: new Set<Permission>([...READ_ALL, 'change:create', 'change:approve', 'backup:create', 'maintenance:write', 'alert:manage']),
  BUSINESS_USER: new Set<Permission>([...READ_ALL, 'change:create', 'alert:manage']),
  SUPPORT_AGENT: new Set<Permission>([
    ...READ_ALL,
    'change:create',
    'change:approve',
    'change:execute',
    'backup:create',
    'maintenance:write',
    'alert:manage',
  ]),
  PARTNER_ADMIN: new Set<Permission>([...READ_ALL]),
  PARTNER_AGENT: new Set<Permission>(['inventory:read', 'health:read', 'alert:read', 'report:read']),
};

export function hasPermission(principal: Principal, permission: Permission): boolean {
  return principal.roles.some((r) => ROLE_PERMISSIONS[r]?.has(permission));
}

/** Support agents operate across accounts; partners only on accounts they resell; everyone else on their own. */
export function canAccessAccount(principal: Principal, accountId: string): boolean {
  if (principal.roles.includes('SUPPORT_AGENT')) return true;
  if (principal.accountId === accountId) return true;
  if (principal.roles.some((r) => r === 'PARTNER_ADMIN' || r === 'PARTNER_AGENT')) {
    return principal.partnerAccountIds?.includes(accountId) ?? false;
  }
  return false;
}

export function assertAccountAccess(principal: Principal, accountId: string): void {
  if (!canAccessAccount(principal, accountId)) {
    // 403 rather than 404 is acceptable here: account IDs are not secret to the caller's tenant boundary.
    throw new ForbiddenProblem(`You do not have access to account ${accountId}`);
  }
}

export function principalOf(locals: Record<string, unknown>): Principal {
  const p = locals.principal as Principal | undefined;
  if (!p) throw new UnauthorizedProblem();
  return p;
}

export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (_req, res, next) => {
    try {
      const principal = principalOf(res.locals);
      const missing = permissions.filter((p) => !hasPermission(principal, p));
      if (missing.length) throw new ForbiddenProblem(`Missing permission(s): ${missing.join(', ')}`);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Guards `/accounts/:accountId/...` routes. */
export const requireAccountAccess: RequestHandler = (req, res, next) => {
  try {
    assertAccountAccess(principalOf(res.locals), req.params.accountId);
    next();
  } catch (err) {
    next(err);
  }
};
```

## apps/sdwan-portal/api/src/cache/TtlCache.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/cache/TtlCache.ts`.

```typescript
interface Entry<V> {
  value: V;
  expiresAt: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

/**
 * Bounded TTL cache with LRU eviction and request coalescing: concurrent `getOrLoad`
 * calls for the same key share one loader promise, so a dashboard opening ten widgets
 * at once triggers a single VCO/FortiManager inventory call.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, Entry<V>>();
  private readonly inflight = new Map<string, Promise<V>>();
  private hits = 0;
  private misses = 0;

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 1000,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): V | undefined {
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (e.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency: Map iteration order is insertion order.
    this.entries.delete(key);
    this.entries.set(key, e);
    return e.value;
  }

  set(key: string, value: V, ttlMs = this.ttlMs): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  async getOrLoad(key: string, loader: () => Promise<V>, ttlMs = this.ttlMs): Promise<V> {
    const cached = this.get(key);
    if (cached !== undefined) {
      this.hits++;
      return cached;
    }
    this.misses++;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const p = loader()
      .then((v) => {
        this.set(key, v, ttlMs);
        return v;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  /** Removes every key starting with `prefix` — used to invalidate one account's inventory after a change. */
  invalidatePrefix(prefix: string): number {
    let n = 0;
    for (const key of [...this.entries.keys()]) {
      if (key.startsWith(prefix)) {
        this.entries.delete(key);
        n++;
      }
    }
    return n;
  }

  stats(): CacheStats {
    return { hits: this.hits, misses: this.misses, size: this.entries.size };
  }
}
```

## apps/sdwan-portal/api/src/config/env.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/config/env.ts`.

```typescript
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
```

## apps/sdwan-portal/api/src/container.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/container.ts`.

```typescript
import type { AppConfig } from './config/env';
import type { JwtSettings } from './auth/jwt';
import type { Logger } from './logging/logger';
import { ProviderRegistry } from './providers/ProviderRegistry';
import { AccountTenant, createRepositories, Repositories } from './repositories';
import { AlertService } from './services/AlertService';
import { BackupService } from './services/BackupService';
import { ChangeRequestService } from './services/ChangeRequestService';
import { EdgeConfigService } from './services/EdgeConfigService';
import { HealthService } from './services/HealthService';
import { InventoryService } from './services/InventoryService';
import { MaintenanceWindowService } from './services/MaintenanceWindowService';
import { ReportService } from './services/ReportService';

export interface Container {
  jwt: JwtSettings;
  providers: ProviderRegistry;
  repos: Repositories;
  inventory: InventoryService;
  health: HealthService;
  edgeConfig: EdgeConfigService;
  backups: BackupService;
  windows: MaintenanceWindowService;
  changes: ChangeRequestService;
  alerts: AlertService;
  reports: ReportService;
  logger: Logger;
}

/** Tenants used in mock mode so the portal is usable without any directory configuration. */
export const MOCK_TENANTS: AccountTenant[] = [
  { accountId: 'ACC-10000001', vendor: 'VELOCLOUD', tenant: '1001' },
  { accountId: 'ACC-10000001', vendor: 'FORTINET', tenant: 'acme' },
];

/**
 * Parses SDWAN_TENANTS: comma-separated `ACCOUNT:VENDOR:TENANT` triples, e.g.
 * `ACC-10000001:VELOCLOUD:1001,ACC-10000001:FORTINET:acme`.
 */
export function parseTenantDirectory(raw: string | undefined): AccountTenant[] {
  if (!raw?.trim()) return [];
  return raw.split(',').map((entry) => {
    const [accountId, vendor, tenant] = entry.trim().split(':');
    if (!/^ACC-\d{8}$/.test(accountId ?? '') || (vendor !== 'VELOCLOUD' && vendor !== 'FORTINET') || !tenant) {
      throw new Error(`Invalid SDWAN_TENANTS entry "${entry.trim()}", expected ACC-########:VELOCLOUD|FORTINET:<tenant>`);
    }
    return { accountId, vendor, tenant };
  });
}

export function createContainer(
  cfg: AppConfig,
  logger: Logger,
  opts: { tenants?: AccountTenant[]; providers?: ProviderRegistry; now?: () => Date } = {},
): Container {
  const providers = opts.providers ?? ProviderRegistry.fromConfig(cfg, logger);
  const tenants = opts.tenants ?? (cfg.SDWAN_PROVIDER_MODE === 'mock' ? MOCK_TENANTS : []);
  const now = opts.now ?? (() => new Date());
  const repos = createRepositories(cfg.METRICS_RETENTION_HOURS, tenants, () => now().getTime());

  const inventory = new InventoryService(providers, repos.tenants, logger.child({ svc: 'inventory' }), cfg.INVENTORY_CACHE_TTL_SEC * 1000);
  const backups = new BackupService(repos.backups, inventory, logger.child({ svc: 'backups' }), now);
  return {
    jwt: { issuer: cfg.JWT_ISSUER, audience: cfg.JWT_AUDIENCE, secret: cfg.JWT_SECRET, publicKey: cfg.JWT_PUBLIC_KEY || undefined },
    providers,
    repos,
    inventory,
    health: new HealthService(inventory, repos.metrics, logger.child({ svc: 'health' })),
    edgeConfig: new EdgeConfigService(inventory),
    backups,
    windows: new MaintenanceWindowService(repos.maintenanceWindows, repos.changeRequests, now),
    changes: new ChangeRequestService(repos.changeRequests, repos.maintenanceWindows, inventory, backups, logger.child({ svc: 'changes' }), now),
    alerts: new AlertService(repos.alerts, inventory, repos.metrics, providers, repos.tenants, logger.child({ svc: 'alerts' }), now),
    reports: new ReportService(inventory, repos.metrics, now),
    logger,
  };
}
```

## apps/sdwan-portal/api/src/domain/approvalRules.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/approvalRules.ts`.

```typescript
import type { Approval, ChangePayload, ChangeRequest, ChangeStatus, ChangeType, Principal, RiskLevel, Role } from './types';
import type { LintFinding } from './firewallLint';

/** Allowed status transitions. Anything not listed is rejected by the service. */
export const TRANSITIONS: Record<ChangeStatus, ChangeStatus[]> = {
  DRAFT: ['SUBMITTED', 'CANCELLED'],
  SUBMITTED: ['APPROVED', 'REJECTED', 'CANCELLED', 'DRAFT'],
  APPROVED: ['SCHEDULED', 'IN_PROGRESS', 'CANCELLED'],
  REJECTED: ['DRAFT'],
  SCHEDULED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'FAILED'],
  COMPLETED: [],
  FAILED: ['DRAFT'],
  CANCELLED: [],
};

export function canTransition(from: ChangeStatus, to: ChangeStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

const BASE_RISK: Record<ChangeType, number> = {
  POLICY_UPDATE: 2,
  FIREWALL_UPDATE: 3,
  CONFIG_ROLLBACK: 4,
  SOFTWARE_UPGRADE: 5,
  EDGE_REBOOT: 4,
};

export interface RiskInput {
  type: ChangeType;
  payload: ChangePayload;
  edgeCount: number;
  /** Edges without an HA peer — a failed change there is a full site outage. */
  nonHaEdgeCount: number;
  lintFindings?: LintFinding[];
  /** Number of existing rules/policies being replaced, for churn estimation. */
  currentItemCount?: number;
}

export interface RiskAssessment {
  level: RiskLevel;
  points: number;
  reasons: string[];
}

/**
 * Points-based risk model. Each factor adds points and a human-readable reason that
 * is stored on the change request and shown to approvers.
 */
export function assessRisk(input: RiskInput): RiskAssessment {
  const reasons: string[] = [];
  let points = BASE_RISK[input.type];
  reasons.push(`${input.type} base risk ${points}`);

  if (input.edgeCount > 1) {
    const blast = input.edgeCount >= 10 ? 4 : input.edgeCount >= 3 ? 2 : 1;
    points += blast;
    reasons.push(`affects ${input.edgeCount} edges (+${blast})`);
  }
  if (input.nonHaEdgeCount > 0 && input.type !== 'POLICY_UPDATE') {
    points += 2;
    reasons.push(`${input.nonHaEdgeCount} edge(s) have no HA peer (+2)`);
  }

  const warnings = (input.lintFindings ?? []).filter((f) => f.severity === 'WARNING');
  if (warnings.some((w) => w.code === 'ANY_ANY_ALLOW')) {
    points += 3;
    reasons.push('rule set contains an any-any ALLOW (+3)');
  }
  const others = warnings.filter((w) => w.code !== 'ANY_ANY_ALLOW').length;
  if (others > 0) {
    points += Math.min(2, others);
    reasons.push(`${others} lint warning(s) (+${Math.min(2, others)})`);
  }

  const newCount =
    input.payload.type === 'POLICY_UPDATE'
      ? input.payload.policies.length
      : input.payload.type === 'FIREWALL_UPDATE'
        ? input.payload.rules.length
        : undefined;
  if (newCount !== undefined && input.currentItemCount !== undefined && input.currentItemCount > 0) {
    const churn = Math.abs(newCount - input.currentItemCount) / input.currentItemCount;
    if (churn >= 0.5) {
      points += 2;
      reasons.push(`large change in item count ${input.currentItemCount} -> ${newCount} (+2)`);
    }
  }
  if (input.payload.type === 'FIREWALL_UPDATE' && input.payload.rules.length === 0) {
    points += 4;
    reasons.push('removes all firewall rules (+4)');
  }

  const level: RiskLevel = points >= 10 ? 'CRITICAL' : points >= 7 ? 'HIGH' : points >= 4 ? 'MEDIUM' : 'LOW';
  return { level, points, reasons };
}

export interface ApprovalPolicy {
  requiredApprovals: number;
  /** At least one approval must come from each of these roles. */
  requiredRoles: Role[];
  requiresMaintenanceWindow: boolean;
}

export function approvalPolicyFor(risk: RiskLevel, emergency: boolean): ApprovalPolicy {
  switch (risk) {
    case 'LOW':
      return { requiredApprovals: 1, requiredRoles: [], requiresMaintenanceWindow: false };
    case 'MEDIUM':
      return { requiredApprovals: 1, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: !emergency };
    case 'HIGH':
      return { requiredApprovals: 2, requiredRoles: ['BUSINESS_ADMIN'], requiresMaintenanceWindow: !emergency };
    case 'CRITICAL':
      return {
        requiredApprovals: 2,
        requiredRoles: ['BUSINESS_ADMIN', 'SUPPORT_AGENT'],
        requiresMaintenanceWindow: !emergency,
      };
  }
}

export const APPROVER_ROLES: Role[] = ['BUSINESS_ADMIN', 'SUPPORT_AGENT'];

export type ApprovalCheck = { ok: true } | { ok: false; reason: string };

/** Validates that `approver` may record a decision on `cr` (does not mutate). */
export function checkCanDecide(cr: ChangeRequest, approver: Principal): ApprovalCheck {
  if (cr.status !== 'SUBMITTED') return { ok: false, reason: `change request is ${cr.status}, not SUBMITTED` };
  if (approver.userId === cr.requestedBy) return { ok: false, reason: 'requesters cannot approve their own change' };
  if (!approver.roles.some((r) => APPROVER_ROLES.includes(r))) {
    return { ok: false, reason: 'approver must hold BUSINESS_ADMIN or SUPPORT_AGENT' };
  }
  if (cr.approvals.some((a) => a.userId === approver.userId)) {
    return { ok: false, reason: 'you have already recorded a decision on this change' };
  }
  if (cr.emergency && !approver.roles.includes('SUPPORT_AGENT') && cr.risk !== 'LOW') {
    // Emergency changes skip the maintenance window, so Uniti NOC must be in the loop.
    const hasSupport = cr.approvals.some((a) => a.role === 'SUPPORT_AGENT' && a.decision === 'APPROVE');
    if (!hasSupport && cr.approvals.length + 1 >= approvalPolicyFor(cr.risk, true).requiredApprovals) {
      return { ok: false, reason: 'emergency changes require a SUPPORT_AGENT approval' };
    }
  }
  return { ok: true };
}

/** The role an approval is recorded under: the most privileged approver role the principal holds. */
export function effectiveApproverRole(principal: Principal): Role {
  if (principal.roles.includes('SUPPORT_AGENT')) return 'SUPPORT_AGENT';
  return 'BUSINESS_ADMIN';
}

export type ApprovalOutcome = 'PENDING' | 'APPROVED' | 'REJECTED';

/**
 * Any single rejection rejects the change. Otherwise it is approved once the approval
 * count and role coverage of the policy are met.
 */
export function evaluateApprovals(approvals: Approval[], policy: ApprovalPolicy): ApprovalOutcome {
  if (approvals.some((a) => a.decision === 'REJECT')) return 'REJECTED';
  const approves = approvals.filter((a) => a.decision === 'APPROVE');
  if (approves.length < policy.requiredApprovals) return 'PENDING';
  const covered = policy.requiredRoles.every((role) => approves.some((a) => a.role === role));
  return covered ? 'APPROVED' : 'PENDING';
}

/** Describes what is still missing — rendered in the UI next to the approve button. */
export function outstandingRequirements(approvals: Approval[], policy: ApprovalPolicy): string[] {
  const approves = approvals.filter((a) => a.decision === 'APPROVE');
  const missing: string[] = [];
  const remaining = policy.requiredApprovals - approves.length;
  if (remaining > 0) missing.push(`${remaining} more approval(s)`);
  for (const role of policy.requiredRoles) {
    if (!approves.some((a) => a.role === role)) missing.push(`an approval from ${role}`);
  }
  return missing;
}
```

## apps/sdwan-portal/api/src/domain/cidr.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/cidr.ts`.

```typescript
import type { PortRange } from './types';

export interface Ipv4Range {
  start: number;
  end: number;
}

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

export function ipToInt(ip: string): number {
  const m = IPV4.exec(ip.trim());
  if (!m) throw new Error(`invalid IPv4 address "${ip}"`);
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) throw new Error(`invalid IPv4 address "${ip}"`);
  return ((octets[0] << 24) >>> 0) + (octets[1] << 16) + (octets[2] << 8) + octets[3];
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isValidCidr(cidr: string): boolean {
  try {
    parseCidr(cidr);
    return true;
  } catch {
    return false;
  }
}

/** Parses "10.0.0.0/8", a bare host "10.0.0.1" (=/32) or "any" (=0.0.0.0/0). */
export function parseCidr(cidr: string): Ipv4Range {
  const value = cidr.trim().toLowerCase();
  if (value === 'any' || value === 'all') return { start: 0, end: 0xffffffff };
  const [ip, prefixStr] = value.split('/');
  const prefix = prefixStr === undefined ? 32 : Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) throw new Error(`invalid prefix in "${cidr}"`);
  const base = ipToInt(ip);
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  const start = (base & mask) >>> 0;
  if (start !== base) throw new Error(`"${cidr}" has host bits set; did you mean ${intToIp(start)}/${prefix}?`);
  const end = (start | (~mask >>> 0)) >>> 0;
  return { start, end };
}

/** Converts a dotted netmask ("255.255.255.0") into a prefix length; FortiOS uses this form. */
export function netmaskToPrefix(mask: string): number {
  const n = ipToInt(mask);
  const inverted = ~n >>> 0;
  if ((inverted & (inverted + 1)) !== 0) throw new Error(`non-contiguous netmask "${mask}"`);
  let bits = 0;
  for (let v = n; v; v = (v << 1) >>> 0) bits++;
  return bits;
}

export function prefixToNetmask(prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return intToIp(mask);
}

export function rangeContains(outer: Ipv4Range, inner: Ipv4Range): boolean {
  return outer.start <= inner.start && outer.end >= inner.end;
}

export function rangesOverlap(a: Ipv4Range, b: Ipv4Range): boolean {
  return a.start <= b.end && b.start <= a.end;
}

/** True when every CIDR in `inner` is fully covered by at least one CIDR in `outer`. Empty list means "any". */
export function cidrSetCovers(outer: string[], inner: string[]): boolean {
  const o = outer.length ? outer.map(parseCidr) : [parseCidr('any')];
  const i = inner.length ? inner.map(parseCidr) : [parseCidr('any')];
  return i.every((ir) => o.some((or) => rangeContains(or, ir)));
}

export function cidrSetsOverlap(a: string[], b: string[]): boolean {
  const ar = a.length ? a.map(parseCidr) : [parseCidr('any')];
  const br = b.length ? b.map(parseCidr) : [parseCidr('any')];
  return ar.some((x) => br.some((y) => rangesOverlap(x, y)));
}

export function portSetCovers(outer: PortRange[], inner: PortRange[]): boolean {
  if (outer.length === 0) return true;
  if (inner.length === 0) return false;
  return inner.every((ir) => outer.some((or) => or.from <= ir.from && or.to >= ir.to));
}

export function portSetsOverlap(a: PortRange[], b: PortRange[]): boolean {
  if (a.length === 0 || b.length === 0) return true;
  return a.some((x) => b.some((y) => x.from <= y.to && y.from <= x.to));
}

/** Parses "443", "8000-8080" or "80,443,1000-2000" into ranges. */
export function parsePortList(spec: string): PortRange[] {
  const trimmed = spec.trim();
  if (!trimmed || trimmed.toLowerCase() === 'any') return [];
  return trimmed.split(/[,\s]+/).map((part) => {
    const [a, b] = part.split(/[-:]/).map((p) => Number(p));
    const from = a;
    const to = b === undefined ? a : b;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to > 65535 || from > to) {
      throw new Error(`invalid port range "${part}"`);
    }
    return { from, to };
  });
}

export function formatPortList(ranges: PortRange[]): string {
  if (ranges.length === 0) return 'any';
  return ranges.map((r) => (r.from === r.to ? String(r.from) : `${r.from}-${r.to}`)).join(',');
}
```

## apps/sdwan-portal/api/src/domain/configDiff.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/configDiff.ts`.

```typescript
import { createHash } from 'node:crypto';

export type DiffOp = 'ADDED' | 'REMOVED' | 'CHANGED';

export interface DiffEntry {
  path: string;
  op: DiffOp;
  before?: unknown;
  after?: unknown;
}

/**
 * Serialises with sorted keys so two semantically identical configs produce the same
 * checksum regardless of the key order the vendor API returned.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalJson((value as Record<string, unknown>)[k])}`)
    .join(',')}}`;
}

export function checksum(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** Keys commonly used as identity inside vendor config arrays. */
const IDENTITY_KEYS = ['id', 'name', 'policyid', 'logicalId', 'seq-num', 'seq_num', 'ruleId'];

function identityOf(item: unknown): string | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  for (const key of IDENTITY_KEYS) {
    const v = (item as Record<string, unknown>)[key];
    if (typeof v === 'string' || typeof v === 'number') return `${key}=${v}`;
  }
  return undefined;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Structural diff of two config documents. Arrays whose elements carry an identity key
 * are matched by identity (so re-ordering firewall rules shows as CHANGED at the rule,
 * not as every index shifting); other arrays are compared positionally.
 */
export function diffConfig(before: unknown, after: unknown, path = '', out: DiffEntry[] = [], maxEntries = 500): DiffEntry[] {
  if (out.length >= maxEntries) return out;
  if (canonicalJson(before) === canonicalJson(after)) return out;

  if (isPlainObject(before) && isPlainObject(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const key of [...keys].sort()) {
      const p = path ? `${path}.${key}` : key;
      if (!(key in before)) out.push({ path: p, op: 'ADDED', after: after[key] });
      else if (!(key in after)) out.push({ path: p, op: 'REMOVED', before: before[key] });
      else diffConfig(before[key], after[key], p, out, maxEntries);
      if (out.length >= maxEntries) break;
    }
    return out;
  }

  if (Array.isArray(before) && Array.isArray(after)) {
    const allKeyed = [...before, ...after].every((i) => identityOf(i) !== undefined);
    if (allKeyed && before.length + after.length > 0) {
      const b = new Map(before.map((i) => [identityOf(i)!, i]));
      const a = new Map(after.map((i) => [identityOf(i)!, i]));
      for (const [id, item] of b) {
        const p = `${path}[${id}]`;
        if (!a.has(id)) out.push({ path: p, op: 'REMOVED', before: item });
        else diffConfig(item, a.get(id), p, out, maxEntries);
      }
      for (const [id, item] of a) {
        if (!b.has(id)) out.push({ path: `${path}[${id}]`, op: 'ADDED', after: item });
      }
      return out;
    }
    const len = Math.max(before.length, after.length);
    for (let i = 0; i < len; i++) {
      const p = `${path}[${i}]`;
      if (i >= before.length) out.push({ path: p, op: 'ADDED', after: after[i] });
      else if (i >= after.length) out.push({ path: p, op: 'REMOVED', before: before[i] });
      else diffConfig(before[i], after[i], p, out, maxEntries);
    }
    return out;
  }

  out.push({ path: path || '(root)', op: 'CHANGED', before, after });
  return out;
}

export function summarizeDiff(entries: DiffEntry[]): Record<DiffOp, number> {
  return entries.reduce<Record<DiffOp, number>>(
    (acc, e) => {
      acc[e.op]++;
      return acc;
    },
    { ADDED: 0, REMOVED: 0, CHANGED: 0 },
  );
}
```

## apps/sdwan-portal/api/src/domain/firewallLint.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/firewallLint.ts`.

```typescript
import type { FirewallRule } from './types';
import { cidrSetCovers, cidrSetsOverlap, parseCidr, portSetCovers, portSetsOverlap } from './cidr';

export type LintSeverity = 'ERROR' | 'WARNING' | 'INFO';

export interface LintFinding {
  ruleId: string;
  severity: LintSeverity;
  code: 'SHADOWED' | 'CONFLICT' | 'DUPLICATE_SEQUENCE' | 'ANY_ANY_ALLOW' | 'INVALID_CIDR' | 'MISSING_DEFAULT_DENY' | 'DISABLED';
  message: string;
  relatedRuleId?: string;
}

function protocolCovers(outer: FirewallRule['protocol'], inner: FirewallRule['protocol']): boolean {
  return outer === 'ANY' || outer === inner;
}

function protocolsOverlap(a: FirewallRule['protocol'], b: FirewallRule['protocol']): boolean {
  return a === 'ANY' || b === 'ANY' || a === b;
}

/** True when every packet matching `inner` would already be matched by `outer`. */
export function ruleCovers(outer: FirewallRule, inner: FirewallRule): boolean {
  return (
    protocolCovers(outer.protocol, inner.protocol) &&
    cidrSetCovers(outer.sourceCidrs, inner.sourceCidrs) &&
    cidrSetCovers(outer.destinationCidrs, inner.destinationCidrs) &&
    (inner.protocol === 'ICMP' || outer.protocol === 'ICMP' || portSetCovers(outer.destinationPorts, inner.destinationPorts))
  );
}

export function rulesOverlap(a: FirewallRule, b: FirewallRule): boolean {
  return (
    protocolsOverlap(a.protocol, b.protocol) &&
    cidrSetsOverlap(a.sourceCidrs, b.sourceCidrs) &&
    cidrSetsOverlap(a.destinationCidrs, b.destinationCidrs) &&
    portSetsOverlap(a.destinationPorts, b.destinationPorts)
  );
}

function isAnyAny(rule: FirewallRule): boolean {
  return (
    rule.protocol === 'ANY' &&
    cidrSetCovers(rule.sourceCidrs, ['0.0.0.0/0']) &&
    cidrSetCovers(rule.destinationCidrs, ['0.0.0.0/0']) &&
    rule.destinationPorts.length === 0
  );
}

/**
 * Static analysis of an ordered rule set, run before a FIREWALL_UPDATE change request is
 * submitted. ERROR findings block submission; WARNINGs are shown to the approver and
 * raise the change's risk score.
 */
export function lintFirewallRules(rules: FirewallRule[]): LintFinding[] {
  const findings: LintFinding[] = [];
  const ordered = [...rules].sort((a, b) => a.sequence - b.sequence);

  const seenSeq = new Map<number, string>();
  for (const r of ordered) {
    const prior = seenSeq.get(r.sequence);
    if (prior) {
      findings.push({
        ruleId: r.id,
        severity: 'ERROR',
        code: 'DUPLICATE_SEQUENCE',
        message: `Rule "${r.name}" reuses sequence ${r.sequence}`,
        relatedRuleId: prior,
      });
    } else {
      seenSeq.set(r.sequence, r.id);
    }
  }

  const valid: FirewallRule[] = [];
  for (const r of ordered) {
    const bad = [...r.sourceCidrs, ...r.destinationCidrs].find((c) => {
      try {
        parseCidr(c);
        return false;
      } catch {
        return true;
      }
    });
    if (bad) {
      findings.push({ ruleId: r.id, severity: 'ERROR', code: 'INVALID_CIDR', message: `Rule "${r.name}" has invalid address "${bad}"` });
    } else {
      valid.push(r);
    }
  }

  const enabled = valid.filter((r) => r.enabled);
  for (const r of valid.filter((x) => !x.enabled)) {
    findings.push({ ruleId: r.id, severity: 'INFO', code: 'DISABLED', message: `Rule "${r.name}" is disabled and has no effect` });
  }

  for (let i = 0; i < enabled.length; i++) {
    const rule = enabled[i];
    if (rule.action === 'ALLOW' && isAnyAny(rule)) {
      findings.push({
        ruleId: rule.id,
        severity: 'WARNING',
        code: 'ANY_ANY_ALLOW',
        message: `Rule "${rule.name}" allows all traffic from any source to any destination`,
      });
    }
    for (let j = 0; j < i; j++) {
      const earlier = enabled[j];
      if (ruleCovers(earlier, rule)) {
        findings.push({
          ruleId: rule.id,
          severity: earlier.action === rule.action ? 'WARNING' : 'ERROR',
          code: 'SHADOWED',
          message:
            earlier.action === rule.action
              ? `Rule "${rule.name}" is redundant: "${earlier.name}" already matches all of its traffic`
              : `Rule "${rule.name}" never matches: "${earlier.name}" (${earlier.action}) matches all of its traffic first`,
          relatedRuleId: earlier.id,
        });
        break;
      }
      if (earlier.action !== rule.action && rulesOverlap(earlier, rule)) {
        findings.push({
          ruleId: rule.id,
          severity: 'WARNING',
          code: 'CONFLICT',
          message: `Rule "${rule.name}" (${rule.action}) partially overlaps "${earlier.name}" (${earlier.action}); the earlier rule wins for the overlap`,
          relatedRuleId: earlier.id,
        });
      }
    }
  }

  const last = enabled[enabled.length - 1];
  if (enabled.length > 0 && !(last.action === 'DENY' && isAnyAny(last))) {
    findings.push({
      ruleId: last.id,
      severity: 'INFO',
      code: 'MISSING_DEFAULT_DENY',
      message: 'Rule set does not end with an explicit deny-all; the vendor implicit default will apply',
    });
  }

  return findings;
}

export function hasBlockingFindings(findings: LintFinding[]): boolean {
  return findings.some((f) => f.severity === 'ERROR');
}
```

## apps/sdwan-portal/api/src/domain/linkScoring.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/linkScoring.ts`.

```typescript
import type { LinkSample, SlaThresholds, ServiceClass, EdgeStatus, LinkState } from './types';
import { round, sanitizeSamples } from './metricsAggregation';

/**
 * Default SLA thresholds per service class. These are the contractual defaults in the
 * managed SD-WAN product schedule; a customer's business policy may override them.
 */
export const DEFAULT_SLA: Record<ServiceClass, SlaThresholds> = {
  REALTIME: { maxLatencyMs: 150, maxJitterMs: 30, maxLossPct: 1 },
  TRANSACTIONAL: { maxLatencyMs: 250, maxJitterMs: 50, maxLossPct: 2 },
  BULK: { maxLatencyMs: 500, maxJitterMs: 100, maxLossPct: 5 },
};

/**
 * Estimates the Mean Opinion Score for a voice call over a link from latency, jitter
 * and loss using the simplified ITU-T G.107 E-model:
 *   effective latency = latency + 2 * jitter + 10
 *   R = 93.2 - delay impairment - 2.5 * loss
 *   MOS = 1 + 0.035R + 7e-6 * R(R-60)(100-R)
 * Returns a value in [1, 4.5].
 */
export function estimateMos(latencyMs: number, jitterMs: number, lossPct: number): number {
  const effective = latencyMs + 2 * jitterMs + 10;
  let r = effective < 160 ? 93.2 - effective / 40 : 93.2 - (effective - 120) / 10;
  r -= 2.5 * lossPct;
  if (r < 0) r = 0;
  if (r > 100) r = 100;
  const mos = 1 + 0.035 * r + 0.000007 * r * (r - 60) * (100 - r);
  return round(Math.min(4.5, Math.max(1, mos)), 2);
}

export type QualityGrade = 'GOOD' | 'FAIR' | 'POOR' | 'BAD';

export function gradeFromMos(mos: number): QualityGrade {
  if (mos >= 4.0) return 'GOOD';
  if (mos >= 3.6) return 'FAIR';
  if (mos >= 3.1) return 'POOR';
  return 'BAD';
}

export interface SampleCompliance {
  compliant: boolean;
  breaches: Array<'LATENCY' | 'JITTER' | 'LOSS'>;
}

export function checkSample(sample: Pick<LinkSample, 'latencyMs' | 'jitterMs' | 'lossPct'>, sla: SlaThresholds): SampleCompliance {
  const breaches: SampleCompliance['breaches'] = [];
  if (sample.latencyMs > sla.maxLatencyMs) breaches.push('LATENCY');
  if (sample.jitterMs > sla.maxJitterMs) breaches.push('JITTER');
  if (sample.lossPct > sla.maxLossPct) breaches.push('LOSS');
  return { compliant: breaches.length === 0, breaches };
}

export interface LinkScore {
  linkId: string;
  edgeId: string;
  samples: number;
  /** % of samples within all SLA thresholds. */
  slaCompliancePct: number;
  /** % of samples where the link was reachable (loss < 100). */
  availabilityPct: number;
  mos: number;
  grade: QualityGrade;
  /** 0..100 composite score used for ranking links in the UI. */
  score: number;
  breachCounts: { latency: number; jitter: number; loss: number };
}

/**
 * Scores a link over a period. The composite score weights voice quality (MOS) at 50%,
 * SLA compliance at 30% and availability at 20%, which keeps a link that is up but
 * consistently slow from outranking one with a short outage and otherwise clean metrics.
 */
export function scoreLink(samples: LinkSample[], sla: SlaThresholds = DEFAULT_SLA.REALTIME): LinkScore | null {
  const clean = sanitizeSamples(samples);
  if (clean.length === 0) return null;

  let compliant = 0;
  let reachable = 0;
  const breachCounts = { latency: 0, jitter: 0, loss: 0 };
  let latSum = 0;
  let jitSum = 0;
  let lossSum = 0;
  let reachableCount = 0;

  for (const s of clean) {
    const c = checkSample(s, sla);
    if (c.compliant) compliant++;
    if (c.breaches.includes('LATENCY')) breachCounts.latency++;
    if (c.breaches.includes('JITTER')) breachCounts.jitter++;
    if (c.breaches.includes('LOSS')) breachCounts.loss++;
    if (s.lossPct < 100) {
      reachable++;
      reachableCount++;
      latSum += s.latencyMs;
      jitSum += s.jitterMs;
    }
    lossSum += s.lossPct;
  }

  const n = clean.length;
  const mos = reachableCount
    ? estimateMos(latSum / reachableCount, jitSum / reachableCount, lossSum / n)
    : 1;
  const slaCompliancePct = round((compliant / n) * 100, 2);
  const availabilityPct = round((reachable / n) * 100, 3);
  const mosNorm = ((mos - 1) / 3.5) * 100;
  const score = Math.round(0.5 * mosNorm + 0.3 * slaCompliancePct + 0.2 * availabilityPct);

  return {
    linkId: clean[0].linkId,
    edgeId: clean[0].edgeId,
    samples: n,
    slaCompliancePct,
    availabilityPct,
    mos,
    grade: gradeFromMos(mos),
    score,
    breachCounts,
  };
}

/**
 * Derives an edge's effective status from its reported status and link states. A vendor
 * may report an edge as "connected" while one of two WAN links is down; customers expect
 * that to show as DEGRADED.
 */
export function deriveEdgeStatus(reported: EdgeStatus, linkStates: LinkState[]): EdgeStatus {
  if (reported === 'DOWN') return 'DOWN';
  const active = linkStates.filter((s) => s !== 'STANDBY');
  if (active.length === 0) return reported === 'UP' ? 'DEGRADED' : reported;
  const up = active.filter((s) => s === 'UP').length;
  if (up === 0) return 'DOWN';
  if (up < active.length) return 'DEGRADED';
  return reported === 'UNKNOWN' ? 'UP' : reported;
}

/**
 * Edge health score: the best link carries traffic, so it dominates (70%), with the
 * mean of the remaining links giving resilience credit (30%). A single-link edge gets
 * its link score, capped at 85 because it has no failover path.
 */
export function edgeHealthScore(linkScores: number[]): number {
  if (linkScores.length === 0) return 0;
  const sorted = [...linkScores].sort((a, b) => b - a);
  if (sorted.length === 1) return Math.min(85, sorted[0]);
  const rest = sorted.slice(1);
  const restMean = rest.reduce((a, v) => a + v, 0) / rest.length;
  return Math.round(0.7 * sorted[0] + 0.3 * restMean);
}
```

## apps/sdwan-portal/api/src/domain/maintenanceWindows.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/maintenanceWindows.ts`.

```typescript
import type { MaintenanceWindow } from './types';

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DAY_MS = 86_400_000;

export interface WindowOccurrence {
  windowId: string;
  start: string;
  end: string;
}

export function parseHhmm(value: string): number {
  const m = HHMM.exec(value);
  if (!m) throw new Error(`invalid time "${value}", expected HH:mm`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function validateWindow(w: Pick<MaintenanceWindow, 'daysOfWeek' | 'startTime' | 'durationMinutes' | 'blackoutDates'>): string[] {
  const errors: string[] = [];
  if (w.daysOfWeek.length === 0) errors.push('at least one day of week is required');
  if (w.daysOfWeek.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) errors.push('daysOfWeek must be integers 0..6');
  if (new Set(w.daysOfWeek).size !== w.daysOfWeek.length) errors.push('daysOfWeek contains duplicates');
  try {
    parseHhmm(w.startTime);
  } catch (e) {
    errors.push((e as Error).message);
  }
  if (w.durationMinutes < 30) errors.push('windows must be at least 30 minutes');
  if (w.durationMinutes > 12 * 60) errors.push('windows may not exceed 12 hours');
  for (const d of w.blackoutDates) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || Number.isNaN(Date.parse(`${d}T00:00:00Z`))) errors.push(`invalid blackout date "${d}"`);
  }
  return errors;
}

function utcMidnight(ms: number): number {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Enumerates occurrences of a weekly window that overlap [fromIso, toIso). Starts the
 * scan one day early so a window that began yesterday and crosses midnight is found.
 */
export function occurrencesBetween(window: MaintenanceWindow, fromIso: string, toIso: string): WindowOccurrence[] {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!(to > from)) return [];
  const startMinute = parseHhmm(window.startTime);
  const durationMs = window.durationMinutes * 60_000;
  const blackout = new Set(window.blackoutDates);
  const days = new Set(window.daysOfWeek);
  const out: WindowOccurrence[] = [];

  for (let day = utcMidnight(from) - DAY_MS; day < to; day += DAY_MS) {
    if (!days.has(new Date(day).getUTCDay())) continue;
    if (blackout.has(isoDate(day))) continue;
    const start = day + startMinute * 60_000;
    const end = start + durationMs;
    if (end > from && start < to) {
      out.push({ windowId: window.id, start: new Date(start).toISOString(), end: new Date(end).toISOString() });
    }
  }
  return out;
}

/** The occurrence that contains `atIso`, if the window is open at that instant. */
export function openOccurrenceAt(window: MaintenanceWindow, atIso: string): WindowOccurrence | undefined {
  const at = Date.parse(atIso);
  return occurrencesBetween(window, new Date(at - DAY_MS).toISOString(), new Date(at + 1).toISOString()).find(
    (o) => Date.parse(o.start) <= at && Date.parse(o.end) > at,
  );
}

/** First occurrence starting at or after `afterIso` within `horizonDays`. */
export function nextOccurrence(window: MaintenanceWindow, afterIso: string, horizonDays = 35): WindowOccurrence | undefined {
  const after = Date.parse(afterIso);
  return occurrencesBetween(window, afterIso, new Date(after + horizonDays * DAY_MS).toISOString()).find(
    (o) => Date.parse(o.start) >= after,
  );
}

export interface ScheduleCheck {
  ok: boolean;
  reason?: string;
  occurrence?: WindowOccurrence;
}

/**
 * A change may be scheduled at `atIso` if the instant falls inside the window and leaves
 * at least `minRemainingMinutes` before it closes (so the change and a potential rollback
 * both fit).
 */
export function checkScheduleInWindow(
  window: MaintenanceWindow,
  atIso: string,
  nowIso: string,
  minRemainingMinutes = 30,
): ScheduleCheck {
  if (Date.parse(atIso) < Date.parse(nowIso)) return { ok: false, reason: 'scheduled time is in the past' };
  const occ = openOccurrenceAt(window, atIso);
  if (!occ) {
    const next = nextOccurrence(window, atIso);
    return {
      ok: false,
      reason: next
        ? `${atIso} is outside maintenance window "${window.name}"; next opening is ${next.start}`
        : `${atIso} is outside maintenance window "${window.name}"`,
    };
  }
  const remaining = (Date.parse(occ.end) - Date.parse(atIso)) / 60_000;
  if (remaining < minRemainingMinutes) {
    return { ok: false, reason: `only ${Math.floor(remaining)} min remain in the window; at least ${minRemainingMinutes} required`, occurrence: occ };
  }
  return { ok: true, occurrence: occ };
}
```

## apps/sdwan-portal/api/src/domain/metricsAggregation.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/metricsAggregation.ts`.

```typescript
import type { LinkSample } from './types';

export interface MetricStats {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

export interface LinkAggregate {
  edgeId: string;
  linkId: string;
  from: string;
  to: string;
  samples: number;
  latencyMs: MetricStats;
  jitterMs: MetricStats;
  lossPct: MetricStats;
  avgRxBps: number;
  avgTxBps: number;
  peakRxBps: number;
  peakTxBps: number;
}

export interface TimeBucket {
  start: string;
  latencyMs: number;
  jitterMs: number;
  lossPct: number;
  rxBps: number;
  txBps: number;
  samples: number;
}

const EMPTY_STATS: MetricStats = { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };

/**
 * Nearest-rank percentile on a pre-sorted array. Nearest-rank is used (rather than
 * linear interpolation) because SLA contracts quote "95% of samples were below X",
 * which must correspond to an observed value.
 */
export function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  if (p <= 0) return sortedAsc[0];
  if (p >= 100) return sortedAsc[sortedAsc.length - 1];
  const rank = Math.ceil((p / 100) * sortedAsc.length);
  return sortedAsc[Math.max(0, rank - 1)];
}

export function summarize(values: number[]): MetricStats {
  const clean = values.filter((v) => Number.isFinite(v));
  if (clean.length === 0) return { ...EMPTY_STATS };
  const sorted = [...clean].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean: round(sum / sorted.length),
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}

/**
 * Drops samples that are physically impossible or obviously sentinel values that both
 * vendors emit when a probe fails (VeloCloud reports -1, FortiGate occasionally reports
 * latency 0 with loss 100 for a dead probe – which is valid and kept).
 */
export function sanitizeSamples(samples: LinkSample[]): LinkSample[] {
  return samples.filter(
    (s) =>
      s.latencyMs >= 0 &&
      s.jitterMs >= 0 &&
      s.lossPct >= 0 &&
      s.lossPct <= 100 &&
      s.latencyMs < 60_000 &&
      !Number.isNaN(Date.parse(s.timestamp)),
  );
}

export function aggregateLink(samples: LinkSample[]): LinkAggregate | null {
  const clean = sanitizeSamples(samples);
  if (clean.length === 0) return null;
  const sorted = [...clean].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  const rx = sorted.map((s) => s.rxBps);
  const tx = sorted.map((s) => s.txBps);
  return {
    edgeId: sorted[0].edgeId,
    linkId: sorted[0].linkId,
    from: sorted[0].timestamp,
    to: sorted[sorted.length - 1].timestamp,
    samples: sorted.length,
    latencyMs: summarize(sorted.map((s) => s.latencyMs)),
    jitterMs: summarize(sorted.map((s) => s.jitterMs)),
    lossPct: summarize(sorted.map((s) => s.lossPct)),
    avgRxBps: Math.round(rx.reduce((a, v) => a + v, 0) / rx.length),
    avgTxBps: Math.round(tx.reduce((a, v) => a + v, 0) / tx.length),
    peakRxBps: Math.max(...rx),
    peakTxBps: Math.max(...tx),
  };
}

/** Groups samples by `${edgeId}/${linkId}` and aggregates each group. */
export function aggregateByLink(samples: LinkSample[]): LinkAggregate[] {
  const groups = new Map<string, LinkSample[]>();
  for (const s of samples) {
    const key = `${s.edgeId}/${s.linkId}`;
    const list = groups.get(key);
    if (list) list.push(s);
    else groups.set(key, [s]);
  }
  const out: LinkAggregate[] = [];
  for (const group of groups.values()) {
    const agg = aggregateLink(group);
    if (agg) out.push(agg);
  }
  return out.sort((a, b) => a.edgeId.localeCompare(b.edgeId) || a.linkId.localeCompare(b.linkId));
}

/**
 * Down-samples into fixed-width buckets for charting. Latency/jitter use the bucket mean,
 * loss uses the bucket max (a single lossy interval should stay visible on a chart), and
 * throughput uses the mean. Empty buckets are omitted rather than zero-filled so charts
 * show gaps instead of false "0 ms" points.
 */
export function bucketize(samples: LinkSample[], bucketSeconds: number): TimeBucket[] {
  if (bucketSeconds <= 0) throw new RangeError('bucketSeconds must be positive');
  const widthMs = bucketSeconds * 1000;
  const buckets = new Map<number, LinkSample[]>();
  for (const s of sanitizeSamples(samples)) {
    const t = Date.parse(s.timestamp);
    const start = Math.floor(t / widthMs) * widthMs;
    const list = buckets.get(start);
    if (list) list.push(s);
    else buckets.set(start, [s]);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([start, list]) => {
      const mean = (f: (s: LinkSample) => number) => round(list.reduce((a, s) => a + f(s), 0) / list.length);
      return {
        start: new Date(start).toISOString(),
        latencyMs: mean((s) => s.latencyMs),
        jitterMs: mean((s) => s.jitterMs),
        lossPct: round(Math.max(...list.map((s) => s.lossPct))),
        rxBps: Math.round(mean((s) => s.rxBps)),
        txBps: Math.round(mean((s) => s.txBps)),
        samples: list.length,
      };
    });
}

/** Chooses a bucket width that yields at most `maxPoints` points over the range. */
export function pickBucketSeconds(fromIso: string, toIso: string, maxPoints = 300): number {
  const spanSec = Math.max(1, (Date.parse(toIso) - Date.parse(fromIso)) / 1000);
  const candidates = [60, 300, 900, 1800, 3600, 3 * 3600, 6 * 3600, 86400];
  return candidates.find((c) => spanSec / c <= maxPoints) ?? 86400;
}

/**
 * Link utilisation as a percentage of contracted bandwidth, using p95 of the samples
 * (the industry-standard "95th percentile billing" view of a link).
 */
export function utilisationP95(samples: LinkSample[], bandwidthKbps: number, direction: 'rx' | 'tx'): number {
  if (bandwidthKbps <= 0) return 0;
  const values = sanitizeSamples(samples)
    .map((s) => (direction === 'rx' ? s.rxBps : s.txBps))
    .sort((a, b) => a - b);
  const p95 = percentile(values, 95);
  return round(Math.min(100, (p95 / (bandwidthKbps * 1000)) * 100), 1);
}
```

## apps/sdwan-portal/api/src/domain/policyTranslation.ts

Application: SD-WAN management (VeloCloud & Fortinet). Stack: Node.js TypeScript API + React. Language: typescript. Path: `apps/sdwan-portal/api/src/domain/policyTranslation.ts`.

```typescript
import type { BusinessPolicy, PolicyPriority, ServiceClass, Vendor } from './types';
import { DEFAULT_SLA } from './linkScoring';
import { cidrSetCovers, parseCidr, portSetCovers } from './cidr';

/**
 * What each vendor can express natively. Used to warn a customer before they submit a
 * neutral policy that cannot be represented faithfully on their edges.
 */
export interface VendorPolicyCapabilities {
  maxPolicies: number;
  supportsRateLimit: boolean;
  supportsDscpRemark: boolean;
  supportsPerPolicySla: boolean;
  supportsMandatoryTransport: boolean;
  supportsApplicationMatch: boolean;
}

export const POLICY_CAPABILITIES: Record<Vendor, VendorPolicyCapabilities> = {
  VELOCLOUD: {
    maxPolicies: 256,
    supportsRateLimit: true,
    supportsDscpRemark: true,
    // VCO applies SLA via service class thresholds at the link-steering level, not per rule.
    supportsPerPolicySla: false,
    supportsMandatoryTransport: true,
    supportsApplicationMatch: true,
  },
  FORTINET: {
    maxPolicies: 4000,
    // FortiOS SD-WAN rules steer only; shaping is a separate traffic-shaper object.
    supportsRateLimit: false,
    supportsDscpRemark: true,
    supportsPerPolicySla: true,
    supportsMandatoryTransport: true,
    supportsApplicationMatch: true,
  },
};

export interface TranslationWarning {
  policyId: string;
  field: string;
  message: string;
}

/** Fields of `policies` that will be dropped or approximated on `vendor`. */
export function translationWarnings(policies: BusinessPolicy[], vendor: Vendor): TranslationWarning[] {
  const caps = POLICY_CAPABILITIES[vendor];
  const warnings: TranslationWarning[] = [];
  if (policies.length > caps.maxPolicies) {
    warnings.push({ policyId: '*', field: 'count', message: `${vendor} supports at most ${caps.maxPolicies} policies` });
  }
  for (const p of policies) {
    if (p.action.rateLimitKbps !== undefined && !caps.supportsRateLimit) {
      warnings.push({ policyId: p.id, field: 'action.rateLimitKbps', message: `rate limit is not applied by ${vendor} SD-WAN rules` });
    }
    if (p.action.dscpRemark !== undefined && !caps.supportsDscpRemark) {
      warnings.push({ policyId: p.id, field: 'action.dscpRemark', message: `DSCP remark is not supported on ${vendor}` });
    }
    if (p.action.sla && !caps.supportsPerPolicySla) {
      warnings.push({
        policyId: p.id,
        field: 'action.sla',
        message: `${vendor} enforces SLA per service class; custom thresholds are approximated by the ${p.action.serviceClass} class`,
      });
    }
    if (p.action.steering === 'MANDATORY_TRANSPORT' && !caps.supportsMandatoryTransport) {
      warnings.push({ policyId: p.id, field: 'action.steering', message: `mandatory transport is not supported on ${vendor}` });
    }
    if ((p.action.steering === 'PREFERRED_TRANSPORT' || p.action.steering === 'MANDATORY_TRANSPORT') && !p.action.preferredTransport) {
      warnings.push({ policyId: p.id, field: 'action.preferredTransport', message: 'transport steering requires a preferredTransport' });
    }
  }
  return warnings;
}

/** Fills defaults so two policies that differ only by implicit values compare equal. */
export function normalizePolicy(p: BusinessPolicy): BusinessPolicy {
  const sorted = (xs?: string[]) => (xs && xs.length ? [...new Set(xs.map((x) => x.trim()))].sort() : undefined);
  return {
    ...p,
    name: p.name.trim(),
    match: {
      applications: sorted(p.match.applications?.map((a) => a.toLowerCase())),
      sourceCidrs: sorted(p.match.sourceCidrs),
      destinationCidrs: sorted(p.match.destinationCidrs),
      protocol: p.match.protocol ?? 'ANY',
      destinationPorts: p.match.destinationPorts?.length
        ? [...p.match.destinationPorts].sort((a, b) => a.from - b.from)
        : undefined,
      dscp: p.match.dscp,
    },
    action: {
      ...p.action,
      sla: p.action.sla ?? DEFAULT_SLA[p.action.serviceClass],
    },
  };
}

/** Policies are evaluated by ascending order; re-numbers to 10, 20, 30... preserving relative order. */
export function renumberPolicies(policies: BusinessPolicy[]): BusinessPolicy[] {
  return [...policies]
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name))
    .map((p, i) => ({ ...p, order: (i + 1) * 10 }));
}

function matchCovers(outer: BusinessPolicy['match'], inner: BusinessPolicy['match']): boolean {
  if (outer.applications?.length) {
    if (!inner.applications?.length) return false;
    if (!inner.applications.every((a) => outer.applications!.includes(a))) return false;
  }
  if (outer.protocol && outer.protocol !== 'ANY' && outer.protocol !== inner.protocol) return false;
  if (outer.dscp !== undefined && outer.dscp !== inner.dscp) return false;
  if (!cidrSetCovers(outer.sourceCidrs ?? [], inner.sourceCidrs ?? [])) return false;
  if (!cidrSetCovers(outer.destinationCidrs ?? [], inner.destinationCidrs ?? [])) return false;
  return portSetCovers(outer.destinationPorts ?? [], inner.destinationPorts ?? []);
}

export interface PolicyIssue {
  policyId: string;
  severity: 'ERROR' | 'WARNING';
  message: string;
}

/** Validates a neutral policy set: names unique, CIDRs valid, no fully shadowed policies. */
export function validatePolicySet(policies: BusinessPolicy[]): PolicyIssue[] {
  const issues: PolicyIssue[] = [];
  const names = new Map<string, string>();
  for (const p of policies) {
    const key = p.name.trim().toLowerCase();
    if (names.has(key)) issues.push({ policyId: p.id, severity: 'ERROR', message: `duplicate policy name "${p.name}"` });
    else names.set(key, p.id);
    for (const c of [...(p.match.sourceCidrs ?? []), ...(p.match.destinationCidrs ?? [])]) {
      try {
        parseCidr(c);
      } catch (e) {
        issues.push({ policyId: p.id, severity: 'ERROR', message: (e as Error).message });
      }
    }
    if (p.action.sla) {
      const s = p.action.sla;
      if (s.maxLatencyMs <= 0 || s.maxJitterMs < 0 || s.maxLossPct < 0 || s.maxLossPct > 100) {
        issues.push({ policyId: p.id, severity: 'ERROR', message: 'SLA thresholds out of range' });
      }
    }
  }
  if (issues.some((i) => i.severity === 'ERROR')) return issues;

  const ordered = policies.filter((p) => p.enabled).sort((a, b) => a.order - b.order);
  for (let i = 0; i < ordered.length; i++) {
    for (let j = 0; j < i; j++) {
      if (matchCovers(ordered[j].match, ordered[i].match)) {
        issues.push({
          policyId: ordered[i].id,
          severity: 'WARNING',
          message: `"${ordered[i].name}" is never reached: "${ordered[j].name}" matches all of its traffic first`,
        });
        break;
      }
    }
  }
  return issues;
}

/** DSCP code points conventionally associated with each service class (RFC 4594). */
export const SERVICE_CLASS_DSCP: Record<ServiceClass, number> = { REALTIME: 46, TRANSACTIONAL: 26, BULK: 10 };

/** Inverse mapping used when a vendor gives us only a DSCP marking. */
export function serviceClassFromDscp(dscp: number | undefined): ServiceClass | undefined {
  if (dscp === undefined) return undefined;
  if (dscp === 46 || dscp === 34 || (dscp >= 40 && dscp <= 47)) return 'REALTIME';
  if (dscp >= 16 && dscp <= 39) return 'TRANSACTIONAL';
  return 'BULK';
}

export function defaultPriorityFor(cls: ServiceClass): PolicyPriority {
  return cls === 'REALTIME' ? 'HIGH' : cls === 'TRANSACTIONAL' ? 'NORMAL' : 'LOW';
}
```
