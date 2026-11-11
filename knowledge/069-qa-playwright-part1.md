# QA automation and API specs: qa/playwright (part 1 of 5)

- **Application:** QA automation and API specs
- **Tech stack:** Playwright, Selenium (Java), Postman, Swagger/OpenAPI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 20

## Files

- `qa/playwright/.env.example` (30 lines)
- `qa/playwright/README.md` (58 lines)
- `qa/playwright/package.json` (32 lines)
- `qa/playwright/playwright.config.ts` (112 lines)
- `qa/playwright/src/api/apiClient.ts` (163 lines)
- `qa/playwright/src/api/domain.ts` (106 lines)
- `qa/playwright/src/api/seedApi.ts` (98 lines)
- `qa/playwright/src/config/env.ts` (75 lines)
- `qa/playwright/src/config/portals.ts` (60 lines)
- `qa/playwright/src/data/builders.ts` (265 lines)
- `qa/playwright/src/fixtures/test.ts` (95 lines)
- `qa/playwright/src/pages/BasePage.ts` (71 lines)
- `qa/playwright/src/pages/BillingPage.ts` (100 lines)
- `qa/playwright/src/pages/CataloguePage.ts` (101 lines)
- `qa/playwright/src/pages/CheckoutPage.ts` (113 lines)
- `qa/playwright/src/pages/LoginPage.ts` (60 lines)
- `qa/playwright/src/pages/PartnerDealsPage.ts` (108 lines)
- `qa/playwright/src/pages/SdwanChangeRequestPage.ts` (105 lines)
- `qa/playwright/src/pages/TicketsPage.ts` (115 lines)
- `qa/playwright/src/support/accessibility.ts` (78 lines)

## qa/playwright/.env.example

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: bash. Path: `qa/playwright/.env.example`.

```bash
# Target environment: dev | staging
TEST_ENV=dev

# Portal base URLs (override per environment)
ECOM_BASE_URL=https://dev.gokinetic.example.net
UCONNECT_BASE_URL=https://dev.uconnect.example.net
PARTNER_BASE_URL=https://dev.partners.example.net
SDWAN_BASE_URL=https://dev.sdwan.example.net
API_BASE_URL=https://dev.api.example.net

# OIDC client-credentials used by API helpers to seed data
OIDC_TOKEN_URL=https://dev.auth.example.net/oauth2/token
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_SCOPE=selfcare.api

# Test personas (one per role). Passwords come from the CI secret store.
CONSUMER_USERNAME=qa.consumer@example.net
CONSUMER_PASSWORD=
BUSINESS_ADMIN_USERNAME=qa.bizadmin@example.net
BUSINESS_ADMIN_PASSWORD=
PARTNER_ADMIN_USERNAME=qa.partneradmin@example.net
PARTNER_ADMIN_PASSWORD=
PARTNER_AGENT_USERNAME=qa.partneragent@example.net
PARTNER_AGENT_PASSWORD=

# Execution tuning
PW_WORKERS=4
PW_RETRIES=1
```

## qa/playwright/README.md

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: markdown. Path: `qa/playwright/README.md`.

````markdown
# Playwright E2E suite

TypeScript Playwright tests covering the customer and partner journeys of the
Uniti Self-Care portals.

| Project | Portal | Default persona | Scope |
|---|---|---|---|
| `ecom-chromium`, `ecom-mobile-safari` | GoKinetic eCom | `CONSUMER` | Catalogue, address qualification, checkout |
| `uconnect-chromium`, `uconnect-firefox` | Uconnect | `BUSINESS_ADMIN` | Billing, invoices, payments, support tickets |
| `partner-chromium` | Enterprise Partner Portal | `PARTNER_ADMIN` | Deal registration and permissions |
| `sdwan-chromium` | SD-WAN Portal | `BUSINESS_ADMIN` | Change requests and approvals |
| `a11y` | all | per page | WCAG 2.2 AA (axe-core) and keyboard checks |
| `api` | API gateway | client credentials | Contract checks complementing Postman |

Mobile Safari and Firefox projects run only `@smoke`-tagged tests.

## Layout

```
playwright.config.ts      projects per portal, reporters, setup dependencies
src/config                environment + portal definitions
src/api                   typed API client (bearer, correlation id, problem+json) and seed helpers
src/data                  fluent test-data builders (all ids prefixed QA-)
src/pages                 page-object models
src/fixtures              extended `test` with page objects, seed API, profile, cleanup
src/support               accessibility and JSON-schema helpers
tests/auth.setup.ts       signs each portal persona in once and stores session state
tests/<portal>/           specs per portal
```

## Running

```bash
cp .env.example .env    # fill persona passwords and OIDC client from the secret store
npm ci
npx playwright install --with-deps
npm test                # everything
npm run test:smoke      # @smoke only
npm run test:uconnect   # one portal
```

`TEST_ENV=staging` plus the staging URLs targets staging. Never point the suite at
production: the checkout tests place real orders against the order API (cancelled
in teardown) and use the payment provider's sandbox card numbers.

## Conventions

- Locators prefer roles and accessible names; `data-testid` only where no
  accessible name exists. A spec that cannot find an element by role is usually
  an accessibility defect worth raising.
- Arrange state through `seed` (API), assert through the UI, then verify the
  side effect through `seed` again.
- Register teardown with `cleanup(() => ...)` immediately after creating data.
- Failing tests record the correlation id from the problem banner as an
  annotation; search Kibana with `correlationId:<value>`.
- Money in assertions is compared in integer minor units; format only for
  display comparisons via `formatMoney`.
````

## qa/playwright/package.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/playwright/package.json`.

```json
{
  "name": "@uniti/qa-playwright",
  "version": "1.0.0",
  "private": true,
  "description": "End-to-end Playwright suite for the Uniti Self-Care portals (eCom, Uconnect, Partner, SD-WAN).",
  "scripts": {
    "test": "playwright test",
    "test:ecom": "playwright test --project=ecom-chromium",
    "test:uconnect": "playwright test --project=uconnect-chromium",
    "test:partner": "playwright test --project=partner-chromium",
    "test:sdwan": "playwright test --project=sdwan-chromium",
    "test:api": "playwright test --project=api",
    "test:a11y": "playwright test --grep @a11y",
    "test:smoke": "playwright test --grep @smoke",
    "report": "playwright show-report reports/html",
    "lint": "eslint \"src/**/*.ts\" \"tests/**/*.ts\"",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@axe-core/playwright": "4.9.1",
    "@playwright/test": "1.47.2",
    "@types/node": "20.14.10",
    "@typescript-eslint/eslint-plugin": "7.16.0",
    "@typescript-eslint/parser": "7.16.0",
    "ajv": "8.17.1",
    "ajv-formats": "3.0.1",
    "dotenv": "16.4.5",
    "eslint": "8.57.0",
    "typescript": "5.5.3"
  }
}
```

## qa/playwright/playwright.config.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/playwright.config.ts`.

```typescript
import { defineConfig, devices } from '@playwright/test';
import { env } from './src/config/env';
import { portals } from './src/config/portals';

/**
 * One Playwright project per portal. Each portal project depends on a matching
 * "setup" project that signs in once and persists storage state, so specs start
 * authenticated. Specs tagged @unauth opt out by clearing storage state locally.
 */
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests',
  outputDir: './reports/artifacts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: env.retries,
  workers: env.workers,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [
    ['list'],
    ['html', { outputFolder: 'reports/html', open: 'never' }],
    ['junit', { outputFile: 'reports/junit/results.xml' }],
  ],
  use: {
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: isCI ? 'retain-on-failure' : 'off',
    locale: 'en-US',
    timezoneId: 'UTC',
    extraHTTPHeaders: { 'X-Test-Run': `pw-${env.name}` },
  },
  projects: [
    {
      name: 'setup-ecom',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.ecom.baseURL },
      metadata: { portal: 'ecom' },
    },
    {
      name: 'setup-uconnect',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.uconnect.baseURL },
      metadata: { portal: 'uconnect' },
    },
    {
      name: 'setup-partner',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.partner.baseURL },
      metadata: { portal: 'partner' },
    },
    {
      name: 'setup-sdwan',
      testMatch: /auth\.setup\.ts/,
      use: { baseURL: portals.sdwan.baseURL },
      metadata: { portal: 'sdwan' },
    },
    {
      name: 'ecom-chromium',
      testDir: './tests/ecom',
      dependencies: ['setup-ecom'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.ecom.baseURL, storageState: portals.ecom.storageState },
    },
    {
      name: 'ecom-mobile-safari',
      testDir: './tests/ecom',
      grep: /@smoke/,
      dependencies: ['setup-ecom'],
      use: { ...devices['iPhone 14'], baseURL: portals.ecom.baseURL, storageState: portals.ecom.storageState },
    },
    {
      name: 'uconnect-chromium',
      testDir: './tests/uconnect',
      dependencies: ['setup-uconnect'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.uconnect.baseURL, storageState: portals.uconnect.storageState },
    },
    {
      name: 'uconnect-firefox',
      testDir: './tests/uconnect',
      grep: /@smoke/,
      dependencies: ['setup-uconnect'],
      use: { ...devices['Desktop Firefox'], baseURL: portals.uconnect.baseURL, storageState: portals.uconnect.storageState },
    },
    {
      name: 'partner-chromium',
      testDir: './tests/partner',
      dependencies: ['setup-partner'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.partner.baseURL, storageState: portals.partner.storageState },
    },
    {
      name: 'sdwan-chromium',
      testDir: './tests/sdwan',
      dependencies: ['setup-sdwan'],
      use: { ...devices['Desktop Chrome'], baseURL: portals.sdwan.baseURL, storageState: portals.sdwan.storageState },
    },
    {
      name: 'a11y',
      testDir: './tests/a11y',
      dependencies: ['setup-ecom', 'setup-uconnect', 'setup-partner'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'api',
      testDir: './tests/api',
      use: { baseURL: env.urls.api },
    },
  ],
});
```

## qa/playwright/src/api/apiClient.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/api/apiClient.ts`.

```typescript
import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { randomUUID } from 'crypto';
import { env } from '@config/env';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | undefined,
    readonly correlationId: string,
  ) {
    super(`API call failed with ${status}: ${problem?.title ?? 'no problem body'} [correlationId=${correlationId}]`);
  }
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | undefined;

/**
 * Fetches a client-credentials token used for test-data seeding. Tokens are
 * cached per worker process and refreshed 60s before expiry.
 */
export async function serviceToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }
  const ctx = await request.newContext();
  try {
    const response = await ctx.post(env.oidc.tokenUrl(), {
      form: {
        grant_type: 'client_credentials',
        client_id: env.oidc.clientId(),
        client_secret: env.oidc.clientSecret(),
        scope: env.oidc.scope,
      },
    });
    if (!response.ok()) {
      throw new Error(`Token endpoint returned ${response.status()}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cachedToken.value;
  } finally {
    await ctx.dispose();
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  correlationId?: string;
  expectedStatus?: number | number[];
}

/**
 * Thin typed wrapper over Playwright's APIRequestContext that adds bearer auth,
 * X-Correlation-Id propagation and RFC 7807 error decoding.
 */
export class ApiClient {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(baseURL: string = env.urls.api, bearer?: string): Promise<ApiClient> {
    const token = bearer ?? (await serviceToken());
    const ctx = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return new ApiClient(ctx);
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('GET', path, options);
  }

  async post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('POST', path, options);
  }

  async patch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('PATCH', path, options);
  }

  async delete(path: string, options: RequestOptions = {}): Promise<void> {
    await this.send<void>('DELETE', path, options);
  }

  async raw(method: string, path: string, options: RequestOptions = {}): Promise<APIResponse> {
    const correlationId = options.correlationId ?? randomUUID();
    return this.ctx.fetch(path, {
      method,
      params: compactQuery(options.query),
      data: options.body,
      headers: { 'X-Correlation-Id': correlationId },
    });
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async send<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const correlationId = options.correlationId ?? randomUUID();
    const response = await this.raw(method, path, { ...options, correlationId });
    const expected = options.expectedStatus === undefined ? undefined : [options.expectedStatus].flat();
    const accepted = expected ? expected.includes(response.status()) : response.ok();
    if (!accepted) {
      throw new ApiError(response.status(), await readProblem(response), correlationId);
    }
    if (response.status() === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

function compactQuery(query: RequestOptions['query']): Record<string, string | number | boolean> | undefined {
  if (!query) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

async function readProblem(response: APIResponse): Promise<ProblemDetails | undefined> {
  const contentType = response.headers()['content-type'] ?? '';
  if (!contentType.includes('json')) {
    return undefined;
  }
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return undefined;
  }
}
```

## qa/playwright/src/api/domain.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/api/domain.ts`.

```typescript
/**
 * Wire types shared by API helpers and specs. They mirror the OpenAPI specs in
 * qa/swagger; amounts are integer minor units with an ISO-4217 currency.
 */

export type OrderStatus = 'DRAFT' | 'SUBMITTED' | 'VALIDATED' | 'PROVISIONING' | 'ACTIVE' | 'CANCELLED' | 'FAILED';
export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';
export type TicketStatus = 'OPEN' | 'IN_PROGRESS' | 'PENDING_CUSTOMER' | 'RESOLVED' | 'CLOSED';
export type DealStage = 'REGISTERED' | 'QUALIFIED' | 'PROPOSAL' | 'WON' | 'LOST' | 'EXPIRED';

export interface Money {
  amountMinor: number;
  currency: string;
}

export interface ServiceAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface Product {
  sku: string;
  name: string;
  category: 'BROADBAND' | 'VOICE' | 'SDWAN' | 'HOSTED';
  downloadMbps?: number;
  uploadMbps?: number;
  monthlyPrice: Money;
  installationFee: Money;
  contractMonths: number;
  segment: 'B2C' | 'B2B';
}

export interface OrderLine {
  sku: string;
  quantity: number;
}

export interface Order {
  id: string;
  accountId: string;
  status: OrderStatus;
  lines: OrderLine[];
  serviceAddress: ServiceAddress;
  total: Money;
  createdAt: string;
}

export interface Account {
  id: string;
  name: string;
  segment: 'B2C' | 'B2B';
  billingEmail: string;
}

export interface Invoice {
  id: string;
  accountId: string;
  periodStart: string;
  periodEnd: string;
  amountDue: Money;
  status: 'ISSUED' | 'PAID' | 'OVERDUE' | 'VOID';
  dueDate: string;
}

export interface Ticket {
  id: string;
  accountId: string;
  subject: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  category: string;
  createdAt: string;
}

export interface Deal {
  id: string;
  partnerId: string;
  customerName: string;
  stage: DealStage;
  estimatedMonthlyValue: Money;
  products: string[];
  expiresAt: string;
}

export interface SdwanSite {
  id: string;
  accountId: string;
  name: string;
  vendor: 'VELOCLOUD' | 'FORTINET';
  edgeModel: string;
  status: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
}

export interface ChangeRequest {
  id: string;
  siteId: string;
  type: 'BANDWIDTH' | 'FIREWALL_RULE' | 'BUSINESS_POLICY' | 'EDGE_REPLACEMENT';
  status: 'PENDING_APPROVAL' | 'APPROVED' | 'SCHEDULED' | 'APPLIED' | 'REJECTED' | 'ROLLED_BACK';
  scheduledFor?: string;
}
```

## qa/playwright/src/api/seedApi.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/api/seedApi.ts`.

```typescript
import { ApiClient, Page } from './apiClient';
import {
  Account,
  ChangeRequest,
  Deal,
  Invoice,
  Order,
  OrderStatus,
  Product,
  SdwanSite,
  Ticket,
} from './domain';
import { DealDraft, OrderDraft, TicketDraft } from '@data/builders';

/**
 * Domain-level API helpers used to arrange state before UI steps and to verify
 * side effects afterwards. Every helper goes through the versioned /api/v1 surface.
 */
export class SeedApi {
  constructor(private readonly api: ApiClient) {}

  listProducts(segment: 'B2C' | 'B2B'): Promise<Page<Product>> {
    return this.api.get<Page<Product>>('/api/v1/catalogue/products', {
      query: { segment, page: 1, pageSize: 50 },
    });
  }

  getAccount(accountId: string): Promise<Account> {
    return this.api.get<Account>(`/api/v1/accounts/${accountId}`);
  }

  createOrder(draft: OrderDraft): Promise<Order> {
    return this.api.post<Order>('/api/v1/orders', { body: draft, expectedStatus: 201 });
  }

  getOrder(orderId: string): Promise<Order> {
    return this.api.get<Order>(`/api/v1/orders/${orderId}`);
  }

  async waitForOrderStatus(orderId: string, target: OrderStatus, timeoutMs = 60_000): Promise<Order> {
    const deadline = Date.now() + timeoutMs;
    let order = await this.getOrder(orderId);
    while (order.status !== target && Date.now() < deadline) {
      if (order.status === 'FAILED' || order.status === 'CANCELLED') {
        throw new Error(`Order ${orderId} reached terminal status ${order.status} while waiting for ${target}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      order = await this.getOrder(orderId);
    }
    if (order.status !== target) {
      throw new Error(`Order ${orderId} still ${order.status} after ${timeoutMs}ms (wanted ${target})`);
    }
    return order;
  }

  cancelOrder(orderId: string): Promise<Order> {
    return this.api.post<Order>(`/api/v1/orders/${orderId}/cancel`, { body: { reason: 'QA_CLEANUP' } });
  }

  listInvoices(accountId: string): Promise<Page<Invoice>> {
    return this.api.get<Page<Invoice>>(`/api/v1/accounts/${accountId}/invoices`, {
      query: { page: 1, pageSize: 12 },
    });
  }

  createTicket(accountId: string, draft: TicketDraft): Promise<Ticket> {
    return this.api.post<Ticket>(`/api/v1/accounts/${accountId}/tickets`, { body: draft, expectedStatus: 201 });
  }

  getTicket(ticketId: string): Promise<Ticket> {
    return this.api.get<Ticket>(`/api/v1/tickets/${ticketId}`);
  }

  closeTicket(ticketId: string): Promise<Ticket> {
    return this.api.patch<Ticket>(`/api/v1/tickets/${ticketId}`, { body: { status: 'CLOSED' } });
  }

  registerDeal(draft: DealDraft): Promise<Deal> {
    return this.api.post<Deal>('/api/v1/partner/deals', { body: draft, expectedStatus: 201 });
  }

  withdrawDeal(dealId: string): Promise<void> {
    return this.api.delete(`/api/v1/partner/deals/${dealId}`, { expectedStatus: [204, 404] });
  }

  listSites(accountId: string): Promise<Page<SdwanSite>> {
    return this.api.get<Page<SdwanSite>>('/api/v1/sdwan/sites', { query: { accountId, page: 1, pageSize: 25 } });
  }

  getChangeRequest(changeRequestId: string): Promise<ChangeRequest> {
    return this.api.get<ChangeRequest>(`/api/v1/sdwan/change-requests/${changeRequestId}`);
  }

  withdrawChangeRequest(changeRequestId: string): Promise<void> {
    return this.api.delete(`/api/v1/sdwan/change-requests/${changeRequestId}`, { expectedStatus: [204, 404, 409] });
  }
}
```

## qa/playwright/src/config/env.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/config/env.ts`.

```typescript
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export type TestEnvironment = 'dev' | 'staging';

export type Role =
  | 'CONSUMER'
  | 'BUSINESS_ADMIN'
  | 'BUSINESS_USER'
  | 'PARTNER_ADMIN'
  | 'PARTNER_AGENT'
  | 'WHOLESALE_BUYER'
  | 'SUPPORT_AGENT';

export interface Credentials {
  username: string;
  password: string;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(`Missing required environment variable ${name}. See qa/playwright/.env.example.`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value : fallback;
}

function parseEnvironment(raw: string): TestEnvironment {
  if (raw === 'dev' || raw === 'staging') {
    return raw;
  }
  throw new Error(`TEST_ENV must be "dev" or "staging", got "${raw}"`);
}

export const env = {
  name: parseEnvironment(optional('TEST_ENV', 'dev')),
  urls: {
    ecom: optional('ECOM_BASE_URL', 'http://localhost:3000'),
    uconnect: optional('UCONNECT_BASE_URL', 'http://localhost:5000'),
    partner: optional('PARTNER_BASE_URL', 'http://localhost:8080'),
    sdwan: optional('SDWAN_BASE_URL', 'http://localhost:4000'),
    api: optional('API_BASE_URL', 'http://localhost:8000'),
  },
  oidc: {
    tokenUrl: () => required('OIDC_TOKEN_URL'),
    clientId: () => required('OIDC_CLIENT_ID'),
    clientSecret: () => required('OIDC_CLIENT_SECRET'),
    scope: optional('OIDC_SCOPE', 'selfcare.api'),
  },
  workers: Number(optional('PW_WORKERS', '4')),
  retries: Number(optional('PW_RETRIES', process.env.CI ? '1' : '0')),
} as const;

const personaVariables: Partial<Record<Role, [string, string]>> = {
  CONSUMER: ['CONSUMER_USERNAME', 'CONSUMER_PASSWORD'],
  BUSINESS_ADMIN: ['BUSINESS_ADMIN_USERNAME', 'BUSINESS_ADMIN_PASSWORD'],
  PARTNER_ADMIN: ['PARTNER_ADMIN_USERNAME', 'PARTNER_ADMIN_PASSWORD'],
  PARTNER_AGENT: ['PARTNER_AGENT_USERNAME', 'PARTNER_AGENT_PASSWORD'],
};

export function credentialsFor(role: Role): Credentials {
  const vars = personaVariables[role];
  if (!vars) {
    throw new Error(`No test persona configured for role ${role}`);
  }
  return { username: required(vars[0]), password: required(vars[1]) };
}
```

## qa/playwright/src/config/portals.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/config/portals.ts`.

```typescript
import * as path from 'path';
import { env, Role } from './env';

export type PortalKey = 'ecom' | 'uconnect' | 'partner' | 'sdwan';

export interface PortalDefinition {
  key: PortalKey;
  displayName: string;
  baseURL: string;
  loginPath: string;
  landingPath: string;
  defaultRole: Role;
  storageState: string;
}

const authDir = path.resolve(__dirname, '../../.auth');

export function storageStatePath(portal: PortalKey, role: Role): string {
  return path.join(authDir, `${portal}.${role.toLowerCase()}.json`);
}

export const portals: Record<PortalKey, PortalDefinition> = {
  ecom: {
    key: 'ecom',
    displayName: 'GoKinetic eCom',
    baseURL: env.urls.ecom,
    loginPath: '/account/login',
    landingPath: '/account',
    defaultRole: 'CONSUMER',
    storageState: storageStatePath('ecom', 'CONSUMER'),
  },
  uconnect: {
    key: 'uconnect',
    displayName: 'Uconnect',
    baseURL: env.urls.uconnect,
    loginPath: '/signin',
    landingPath: '/dashboard',
    defaultRole: 'BUSINESS_ADMIN',
    storageState: storageStatePath('uconnect', 'BUSINESS_ADMIN'),
  },
  partner: {
    key: 'partner',
    displayName: 'Enterprise Partner Portal',
    baseURL: env.urls.partner,
    loginPath: '/login',
    landingPath: '/deals',
    defaultRole: 'PARTNER_ADMIN',
    storageState: storageStatePath('partner', 'PARTNER_ADMIN'),
  },
  sdwan: {
    key: 'sdwan',
    displayName: 'SD-WAN Portal',
    baseURL: env.urls.sdwan,
    loginPath: '/login',
    landingPath: '/sites',
    defaultRole: 'BUSINESS_ADMIN',
    storageState: storageStatePath('sdwan', 'BUSINESS_ADMIN'),
  },
};
```

## qa/playwright/src/data/builders.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/data/builders.ts`.

```typescript
import { randomBytes } from 'crypto';
import { DealStage, Money, OrderLine, ServiceAddress, TicketPriority } from '@api/domain';

/**
 * Fluent builders for test data. Defaults are valid for the happy path; specs
 * override only what the scenario cares about. Every generated identifier is
 * prefixed with "QA-" so nightly cleanup jobs can find and purge it.
 */

export function runTag(): string {
  return `QA-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`.toUpperCase();
}

export function money(amountMinor: number, currency = 'USD'): Money {
  if (!Number.isInteger(amountMinor)) {
    throw new Error(`Money must be integer minor units, got ${amountMinor}`);
  }
  return { amountMinor, currency };
}

export function formatMoney(value: Money, locale = 'en-US'): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: value.currency }).format(value.amountMinor / 100);
}

export class AddressBuilder {
  private address: ServiceAddress = {
    line1: '1200 Fibre Way',
    city: 'Little Rock',
    state: 'AR',
    postalCode: '72201',
    country: 'US',
  };

  static serviceable(): AddressBuilder {
    return new AddressBuilder();
  }

  static outOfFootprint(): AddressBuilder {
    return new AddressBuilder().withLine1('9 Nowhere Rd').withCity('Barrow').withState('AK').withPostalCode('99723');
  }

  withLine1(line1: string): this {
    this.address.line1 = line1;
    return this;
  }

  withUnit(unit: string): this {
    this.address.line2 = unit;
    return this;
  }

  withCity(city: string): this {
    this.address.city = city;
    return this;
  }

  withState(state: string): this {
    this.address.state = state;
    return this;
  }

  withPostalCode(postalCode: string): this {
    this.address.postalCode = postalCode;
    return this;
  }

  build(): ServiceAddress {
    return { ...this.address };
  }
}

export interface OrderDraft {
  accountId: string;
  lines: OrderLine[];
  serviceAddress: ServiceAddress;
  requestedInstallDate?: string;
  externalReference: string;
}

export class OrderBuilder {
  private draft: OrderDraft;

  constructor(accountId: string) {
    this.draft = {
      accountId,
      lines: [{ sku: 'FIB-500', quantity: 1 }],
      serviceAddress: AddressBuilder.serviceable().build(),
      externalReference: runTag(),
    };
  }

  static forAccount(accountId: string): OrderBuilder {
    return new OrderBuilder(accountId);
  }

  withPlan(sku: string): this {
    this.draft.lines = [{ sku, quantity: 1 }, ...this.draft.lines.filter((l) => !l.sku.startsWith('FIB-'))];
    return this;
  }

  withAddOn(sku: string, quantity = 1): this {
    this.draft.lines.push({ sku, quantity });
    return this;
  }

  at(address: ServiceAddress): this {
    this.draft.serviceAddress = address;
    return this;
  }

  installOn(date: Date): this {
    this.draft.requestedInstallDate = date.toISOString().slice(0, 10);
    return this;
  }

  build(): OrderDraft {
    return structuredClone(this.draft);
  }
}

export interface TicketDraft {
  subject: string;
  description: string;
  priority: TicketPriority;
  category: 'BILLING' | 'CONNECTIVITY' | 'INSTALLATION' | 'SDWAN' | 'GENERAL';
  serviceId?: string;
}

export class TicketBuilder {
  private draft: TicketDraft = {
    subject: '',
    description: 'Intermittent loss of sync on the ONT between 18:00 and 20:00 local time.',
    priority: 'P3',
    category: 'CONNECTIVITY',
  };

  constructor() {
    this.draft.subject = `${runTag()} Intermittent connectivity`;
  }

  static connectivity(): TicketBuilder {
    return new TicketBuilder();
  }

  static billingDispute(): TicketBuilder {
    return new TicketBuilder()
      .withCategory('BILLING')
      .withSubject('Duplicate charge on latest invoice')
      .withDescription('The installation fee appears twice on the most recent invoice.');
  }

  withSubject(subject: string): this {
    this.draft.subject = `${runTag()} ${subject}`;
    return this;
  }

  withDescription(description: string): this {
    this.draft.description = description;
    return this;
  }

  withPriority(priority: TicketPriority): this {
    this.draft.priority = priority;
    return this;
  }

  withCategory(category: TicketDraft['category']): this {
    this.draft.category = category;
    return this;
  }

  forService(serviceId: string): this {
    this.draft.serviceId = serviceId;
    return this;
  }

  build(): TicketDraft {
    return { ...this.draft };
  }
}

export interface DealDraft {
  customerName: string;
  customerDomain: string;
  contactEmail: string;
  products: string[];
  estimatedMonthlyValue: Money;
  siteCount: number;
  stage: DealStage;
  notes?: string;
}

export class DealBuilder {
  private draft: DealDraft;

  constructor() {
    const tag = runTag().toLowerCase();
    this.draft = {
      customerName: `QA Logistics ${tag}`,
      customerDomain: `${tag}.qa.example.net`,
      contactEmail: `it-lead@${tag}.qa.example.net`,
      products: ['FIB-BIZ-1G', 'SDWAN-VC-STD'],
      estimatedMonthlyValue: money(249_900),
      siteCount: 3,
      stage: 'REGISTERED',
    };
  }

  static enterprise(): DealBuilder {
    return new DealBuilder();
  }

  withCustomer(name: string, domain: string): this {
    this.draft.customerName = name;
    this.draft.customerDomain = domain;
    this.draft.contactEmail = `it-lead@${domain}`;
    return this;
  }

  withProducts(...skus: string[]): this {
    this.draft.products = skus;
    return this;
  }

  withMonthlyValue(amountMinor: number): this {
    this.draft.estimatedMonthlyValue = money(amountMinor);
    return this;
  }

  withSites(count: number): this {
    this.draft.siteCount = count;
    return this;
  }

  withNotes(notes: string): this {
    this.draft.notes = notes;
    return this;
  }

  build(): DealDraft {
    return structuredClone(this.draft);
  }
}

export interface ChangeRequestDraft {
  siteName: string;
  type: 'BANDWIDTH' | 'FIREWALL_RULE' | 'BUSINESS_POLICY' | 'EDGE_REPLACEMENT';
  newBandwidthMbps?: number;
  justification: string;
  scheduledFor: Date;
}

export function bandwidthChange(siteName: string, newBandwidthMbps: number): ChangeRequestDraft {
  const scheduledFor = new Date();
  scheduledFor.setUTCDate(scheduledFor.getUTCDate() + 3);
  scheduledFor.setUTCHours(2, 0, 0, 0);
  return {
    siteName,
    type: 'BANDWIDTH',
    newBandwidthMbps,
    justification: `${runTag()} Seasonal traffic growth at branch`,
    scheduledFor,
  };
}
```

## qa/playwright/src/fixtures/test.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/fixtures/test.ts`.

```typescript
import { test as base, expect } from '@playwright/test';
import { ApiClient } from '@api/apiClient';
import { SeedApi } from '@api/seedApi';
import { BillingPage } from '@pages/BillingPage';
import { CataloguePage } from '@pages/CataloguePage';
import { CheckoutPage } from '@pages/CheckoutPage';
import { PartnerDealsPage } from '@pages/PartnerDealsPage';
import { SdwanChangeRequestPage } from '@pages/SdwanChangeRequestPage';
import { TicketsPage } from '@pages/TicketsPage';

type Cleanup = () => Promise<unknown>;

interface Profile {
  userId: string;
  accountId: string;
  roles: string[];
}

interface TestFixtures {
  catalogue: CataloguePage;
  checkout: CheckoutPage;
  billing: BillingPage;
  tickets: TicketsPage;
  deals: PartnerDealsPage;
  changeRequests: SdwanChangeRequestPage;
  profile: Profile;
  cleanup: (task: Cleanup) => void;
}

interface WorkerFixtures {
  seed: SeedApi;
}

/**
 * Project-wide test object. Page objects are constructed lazily per test; the
 * seeding API client is shared per worker; `cleanup` collects teardown tasks
 * that run in reverse order even when the test fails.
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  seed: [
    async ({}, use) => {
      const client = await ApiClient.create();
      await use(new SeedApi(client));
      await client.dispose();
    },
    { scope: 'worker' },
  ],

  cleanup: async ({}, use, testInfo) => {
    const tasks: Cleanup[] = [];
    await use((task) => tasks.push(task));
    const failures: string[] = [];
    for (const task of tasks.reverse()) {
      try {
        await task();
      } catch (error) {
        failures.push(String(error));
      }
    }
    if (failures.length) {
      await testInfo.attach('cleanup-failures', { body: failures.join('\n'), contentType: 'text/plain' });
    }
  },

  profile: async ({ page }, use) => {
    const response = await page.request.get('/api/v1/me');
    expect(response.ok(), 'signed-in profile lookup').toBeTruthy();
    await use((await response.json()) as Profile);
  },

  catalogue: async ({ page }, use) => use(new CataloguePage(page)),
  checkout: async ({ page }, use) => use(new CheckoutPage(page)),
  billing: async ({ page }, use) => use(new BillingPage(page)),
  tickets: async ({ page }, use) => use(new TicketsPage(page)),
  deals: async ({ page }, use) => use(new PartnerDealsPage(page)),
  changeRequests: async ({ page }, use) => use(new SdwanChangeRequestPage(page)),
});

/**
 * On failure, capture the correlation id rendered by the problem banner so the
 * report links straight to the backend logs in Kibana.
 */
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) {
    return;
  }
  const banner = page.getByTestId('problem-correlation-id');
  if ((await banner.count()) > 0) {
    const correlationId = (await banner.first().textContent())?.trim();
    testInfo.annotations.push({ type: 'correlationId', description: correlationId });
  }
});

export { expect };
```

## qa/playwright/src/pages/BasePage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/BasePage.ts`.

```typescript
import { expect, Locator, Page, Response } from '@playwright/test';

/**
 * Behaviour common to every portal page: navigation with a ready signal,
 * toast handling, and access to the shared problem+json error banner that all
 * portals render when an API call fails.
 */
export abstract class BasePage {
  protected abstract readonly path: string;

  constructor(protected readonly page: Page) {}

  get toast(): Locator {
    return this.page.getByRole('status').filter({ has: this.page.getByTestId('toast-message') });
  }

  get errorBanner(): Locator {
    return this.page.getByTestId('problem-banner');
  }

  get mainHeading(): Locator {
    return this.page.getByRole('main').getByRole('heading', { level: 1 });
  }

  get spinner(): Locator {
    return this.page.getByTestId('page-loading');
  }

  async goto(query?: Record<string, string>): Promise<this> {
    const search = query ? `?${new URLSearchParams(query).toString()}` : '';
    await this.page.goto(`${this.path}${search}`);
    await this.waitUntilReady();
    return this;
  }

  async waitUntilReady(): Promise<void> {
    await expect(this.spinner).toBeHidden();
    await expect(this.mainHeading).toBeVisible();
  }

  async expectToast(text: string | RegExp): Promise<void> {
    await expect(this.toast).toContainText(text);
  }

  async expectProblem(title: string | RegExp): Promise<void> {
    await expect(this.errorBanner).toBeVisible();
    await expect(this.errorBanner.getByTestId('problem-title')).toHaveText(title);
  }

  /**
   * Correlation id shown in the error banner so support can trace the failure.
   * Specs attach it to the report on failure.
   */
  async problemCorrelationId(): Promise<string | null> {
    const ref = this.errorBanner.getByTestId('problem-correlation-id');
    return (await ref.count()) > 0 ? ref.textContent() : null;
  }

  protected waitForApi(method: string, urlPart: string | RegExp): Promise<Response> {
    return this.page.waitForResponse(
      (response) =>
        response.request().method() === method &&
        (typeof urlPart === 'string' ? response.url().includes(urlPart) : urlPart.test(response.url())),
    );
  }

  protected tableRows(table: Locator): Locator {
    return table.getByRole('row').filter({ hasNot: this.page.getByRole('columnheader') });
  }
}
```

## qa/playwright/src/pages/BillingPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/BillingPage.ts`.

```typescript
import { Download, expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

/**
 * Uconnect billing: invoice list, invoice detail, PDF download and one-off
 * payments against the outstanding balance.
 */
export class BillingPage extends BasePage {
  protected readonly path = '/billing';

  readonly balanceCard: Locator;
  readonly invoicesTable: Locator;
  readonly statusFilter: Locator;
  readonly payNow: Locator;
  readonly pagination: Locator;

  constructor(page: Page) {
    super(page);
    this.balanceCard = page.getByTestId('balance-card');
    this.invoicesTable = page.getByRole('table', { name: 'Invoices' });
    this.statusFilter = page.getByRole('combobox', { name: 'Invoice status' });
    this.payNow = page.getByRole('button', { name: 'Make a payment' });
    this.pagination = page.getByRole('navigation', { name: 'Pagination' });
  }

  async outstandingBalance(): Promise<string> {
    return (await this.balanceCard.getByTestId('balance-amount').textContent())?.trim() ?? '';
  }

  invoiceRows(): Locator {
    return this.tableRows(this.invoicesTable);
  }

  invoiceRow(invoiceId: string): Locator {
    return this.invoiceRows().filter({ hasText: invoiceId });
  }

  async filterByStatus(status: 'All' | 'Issued' | 'Paid' | 'Overdue'): Promise<void> {
    const reload = this.waitForApi('GET', '/invoices');
    await this.statusFilter.selectOption({ label: status });
    await reload;
  }

  async expectAllRowsHaveStatus(status: string): Promise<void> {
    const statuses = await this.invoiceRows().getByTestId('invoice-status').allTextContents();
    expect(statuses.length).toBeGreaterThan(0);
    for (const value of statuses) {
      expect(value.trim()).toBe(status);
    }
  }

  async goToPage(pageNumber: number): Promise<void> {
    const reload = this.waitForApi('GET', /invoices\?.*page=/);
    await this.pagination.getByRole('button', { name: `Page ${pageNumber}` }).click();
    await reload;
    await expect(this.pagination.getByRole('button', { name: `Page ${pageNumber}` })).toHaveAttribute('aria-current', 'page');
  }

  async openInvoice(invoiceId: string): Promise<void> {
    await this.invoiceRow(invoiceId).getByRole('link', { name: invoiceId }).click();
    await expect(this.page.getByRole('heading', { name: `Invoice ${invoiceId}` })).toBeVisible();
  }

  async invoiceLineItems(): Promise<Array<{ description: string; amount: string }>> {
    const rows = this.tableRows(this.page.getByRole('table', { name: 'Charges' }));
    const count = await rows.count();
    const items: Array<{ description: string; amount: string }> = [];
    for (let i = 0; i < count; i++) {
      const cells = rows.nth(i).getByRole('cell');
      items.push({
        description: (await cells.first().textContent())?.trim() ?? '',
        amount: (await cells.last().textContent())?.trim() ?? '',
      });
    }
    return items;
  }

  async downloadInvoicePdf(invoiceId: string): Promise<Download> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.invoiceRow(invoiceId).getByRole('button', { name: 'Download PDF' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(`${invoiceId}.pdf`);
    return download;
  }

  async payOutstandingWithSavedMethod(lastFour: string): Promise<string> {
    await this.payNow.click();
    const dialog = this.page.getByRole('dialog', { name: 'Make a payment' });
    await dialog.getByRole('radio', { name: 'Pay full balance' }).check();
    await dialog.getByRole('radio', { name: new RegExp(`ending ${lastFour}`) }).check();
    const payment = this.waitForApi('POST', '/payments');
    await dialog.getByRole('button', { name: 'Pay now' }).click();
    const response = await payment;
    expect(response.status()).toBe(202);
    const receipt = dialog.getByTestId('payment-reference');
    await expect(receipt).toBeVisible();
    return (await receipt.textContent())?.trim() ?? '';
  }
}
```

## qa/playwright/src/pages/CataloguePage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/CataloguePage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { ServiceAddress } from '@api/domain';
import { BasePage } from './BasePage';

export type Segment = 'residential' | 'business';

/**
 * GoKinetic storefront catalogue: address qualification, plan cards and
 * add-on selection.
 */
export class CataloguePage extends BasePage {
  protected readonly path: string;

  readonly addressSearch: Locator;
  readonly addressSuggestions: Locator;
  readonly checkAvailability: Locator;
  readonly availabilityResult: Locator;
  readonly planCards: Locator;
  readonly speedFilter: Locator;
  readonly cartButton: Locator;

  constructor(page: Page, segment: Segment = 'residential') {
    super(page);
    this.path = segment === 'business' ? '/business/plans' : '/plans';
    this.addressSearch = page.getByRole('combobox', { name: 'Service address' });
    this.addressSuggestions = page.getByRole('listbox', { name: 'Address suggestions' }).getByRole('option');
    this.checkAvailability = page.getByRole('button', { name: 'Check availability' });
    this.availabilityResult = page.getByTestId('availability-result');
    this.planCards = page.getByTestId('plan-card');
    this.speedFilter = page.getByRole('group', { name: 'Filter by speed' });
    this.cartButton = page.getByRole('link', { name: /^Cart/ });
  }

  async qualifyAddress(address: ServiceAddress): Promise<void> {
    const query = `${address.line1}, ${address.city}`;
    await this.addressSearch.fill(query);
    await expect(this.addressSuggestions.first()).toBeVisible();
    await this.addressSuggestions.filter({ hasText: address.postalCode }).first().click();
    const qualification = this.waitForApi('POST', '/api/v1/catalogue/serviceability');
    await this.checkAvailability.click();
    await qualification;
    await expect(this.availabilityResult).toBeVisible();
  }

  async expectServiceable(): Promise<void> {
    await expect(this.availabilityResult).toHaveAttribute('data-serviceable', 'true');
    await expect(this.planCards.first()).toBeVisible();
  }

  async expectNotServiceable(): Promise<void> {
    await expect(this.availabilityResult).toHaveAttribute('data-serviceable', 'false');
    await expect(this.availabilityResult.getByRole('button', { name: 'Notify me when available' })).toBeVisible();
  }

  planCard(sku: string): Locator {
    return this.planCards.filter({ has: this.page.locator(`[data-sku="${sku}"]`) });
  }

  async filterBySpeed(label: '100 Mbps' | '500 Mbps' | '1 Gbps' | '2 Gbps'): Promise<void> {
    await this.speedFilter.getByRole('checkbox', { name: label }).check();
  }

  async visiblePlanNames(): Promise<string[]> {
    return this.planCards.getByRole('heading').allTextContents();
  }

  async planPrice(sku: string): Promise<string> {
    return (await this.planCard(sku).getByTestId('plan-monthly-price').textContent())?.trim() ?? '';
  }

  async selectPlan(sku: string): Promise<void> {
    const card = this.planCard(sku);
    await expect(card).toBeVisible();
    const addToCart = this.waitForApi('POST', '/api/v1/cart/items');
    await card.getByRole('button', { name: 'Choose plan' }).click();
    await addToCart;
  }

  async addOn(name: 'Whole-home Wi-Fi' | 'Home Phone' | 'Static IP'): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Customise your plan' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name }).check();
  }

  async continueToCheckout(): Promise<void> {
    const dialog = this.page.getByRole('dialog', { name: 'Customise your plan' });
    if (await dialog.isVisible()) {
      await dialog.getByRole('button', { name: 'Continue' }).click();
    } else {
      await this.cartButton.click();
      await this.page.getByRole('button', { name: 'Checkout' }).click();
    }
    await this.page.waitForURL('**/checkout/**');
  }

  async cartCount(): Promise<number> {
    const badge = await this.cartButton.getByTestId('cart-count').textContent();
    return Number(badge ?? '0');
  }
}
```

## qa/playwright/src/pages/CheckoutPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/CheckoutPage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { BasePage } from './BasePage';

export interface ContactDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

/**
 * Multi-step checkout: contact -> installation slot -> payment -> review.
 * Card entry happens inside the payment provider's iframe; tests use the
 * provider's published sandbox card numbers only.
 */
export class CheckoutPage extends BasePage {
  protected readonly path = '/checkout/contact';

  readonly stepper: Locator;
  readonly summary: Locator;
  readonly continueButton: Locator;
  readonly placeOrder: Locator;
  readonly termsCheckbox: Locator;
  readonly confirmation: Locator;

  constructor(page: Page) {
    super(page);
    this.stepper = page.getByRole('navigation', { name: 'Checkout progress' });
    this.summary = page.getByRole('complementary', { name: 'Order summary' });
    this.continueButton = page.getByRole('button', { name: 'Continue' });
    this.placeOrder = page.getByRole('button', { name: 'Place order' });
    this.termsCheckbox = page.getByRole('checkbox', { name: /I agree to the terms of service/ });
    this.confirmation = page.getByTestId('order-confirmation');
  }

  async expectStep(name: 'Contact' | 'Installation' | 'Payment' | 'Review'): Promise<void> {
    await expect(this.stepper.getByRole('listitem').filter({ hasText: name })).toHaveAttribute('aria-current', 'step');
  }

  async fillContact(details: ContactDetails): Promise<void> {
    await this.expectStep('Contact');
    await this.page.getByLabel('First name').fill(details.firstName);
    await this.page.getByLabel('Last name').fill(details.lastName);
    await this.page.getByLabel('Email').fill(details.email);
    await this.page.getByLabel('Mobile number').fill(details.phone);
    await this.continueButton.click();
  }

  async chooseFirstInstallSlot(): Promise<string> {
    await this.expectStep('Installation');
    const slots = this.page.getByRole('radiogroup', { name: 'Installation appointment' }).getByRole('radio');
    await expect(slots.first()).toBeVisible();
    const firstEnabled = slots.and(this.page.locator(':not([disabled])')).first();
    const label = (await firstEnabled.getAttribute('aria-label')) ?? '';
    await firstEnabled.check();
    await this.continueButton.click();
    return label;
  }

  async payWithSandboxCard(card: { number: string; expiry: string; cvc: string; postalCode: string }): Promise<void> {
    await this.expectStep('Payment');
    const frame = this.page.frameLocator('iframe[title="Secure card payment input frame"]');
    await frame.getByPlaceholder('Card number').fill(card.number);
    await frame.getByPlaceholder('MM / YY').fill(card.expiry);
    await frame.getByPlaceholder('CVC').fill(card.cvc);
    await frame.getByPlaceholder('ZIP').fill(card.postalCode);
    await this.page.getByRole('checkbox', { name: 'Enrol in AutoPay' }).check();
    await this.continueButton.click();
  }

  async summaryLine(label: string): Promise<string> {
    const row = this.summary.getByRole('row').filter({ hasText: label });
    return (await row.getByRole('cell').last().textContent())?.trim() ?? '';
  }

  async expectSummaryContains(...items: string[]): Promise<void> {
    for (const item of items) {
      await expect(this.summary).toContainText(item);
    }
  }

  async applyPromoCode(code: string): Promise<void> {
    await this.summary.getByRole('button', { name: 'Add promo code' }).click();
    await this.summary.getByLabel('Promo code').fill(code);
    const apply = this.waitForApi('POST', '/api/v1/cart/promotions');
    await this.summary.getByRole('button', { name: 'Apply' }).click();
    await apply;
  }

  /**
   * Places the order and returns the order id from the confirmation page.
   */
  async submitOrder(): Promise<string> {
    await this.expectStep('Review');
    await this.termsCheckbox.check();
    const submit = this.waitForApi('POST', '/api/v1/orders');
    await this.placeOrder.click();
    const response = await submit;
    expect(response.status(), 'order submission status').toBe(201);
    await expect(this.confirmation).toBeVisible();
    const orderId = (await this.confirmation.getByTestId('order-id').textContent())?.trim() ?? '';
    expect(orderId).toMatch(/^ORD-\d{8}$/);
    return orderId;
  }

  async expectPlaceOrderBlockedUntilTermsAccepted(): Promise<void> {
    await this.expectStep('Review');
    await expect(this.placeOrder).toBeDisabled();
    await this.termsCheckbox.check();
    await expect(this.placeOrder).toBeEnabled();
  }
}
```

## qa/playwright/src/pages/LoginPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/LoginPage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { Credentials } from '@config/env';
import { PortalDefinition } from '@config/portals';

/**
 * All portals delegate sign-in to the shared OIDC hosted login page, so a single
 * page object covers them. The portal definition supplies the entry path and
 * the landing page that proves the session was established.
 */
export class LoginPage {
  readonly username: Locator;
  readonly password: Locator;
  readonly submit: Locator;
  readonly mfaCode: Locator;
  readonly verify: Locator;
  readonly error: Locator;

  constructor(private readonly page: Page, private readonly portal: PortalDefinition) {
    this.username = page.getByLabel('Email address');
    this.password = page.getByLabel('Password', { exact: true });
    this.submit = page.getByRole('button', { name: 'Sign in' });
    this.mfaCode = page.getByLabel('Verification code');
    this.verify = page.getByRole('button', { name: 'Verify' });
    this.error = page.getByRole('alert');
  }

  async open(): Promise<void> {
    await this.page.goto(this.portal.loginPath);
    await expect(this.username).toBeVisible();
  }

  async signIn(credentials: Credentials, mfaCode?: string): Promise<void> {
    await this.username.fill(credentials.username);
    await this.password.fill(credentials.password);
    await this.submit.click();
    if (mfaCode) {
      await expect(this.mfaCode).toBeVisible();
      await this.mfaCode.fill(mfaCode);
      await this.verify.click();
    }
  }

  async signInAndLand(credentials: Credentials, mfaCode?: string): Promise<void> {
    await this.open();
    await this.signIn(credentials, mfaCode);
    await this.page.waitForURL((url) => url.pathname.startsWith(this.portal.landingPath), { timeout: 30_000 });
  }

  async expectRejected(message: string | RegExp = /incorrect email or password/i): Promise<void> {
    await expect(this.error).toContainText(message);
    await expect(this.page).toHaveURL(new RegExp(this.portal.loginPath.replace('/', '\\/')));
  }

  async signOut(): Promise<void> {
    await this.page.getByRole('button', { name: 'Account menu' }).click();
    await this.page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(this.username).toBeVisible();
  }
}
```

## qa/playwright/src/pages/PartnerDealsPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/PartnerDealsPage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { DealStage } from '@api/domain';
import { DealDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * Enterprise Partner Portal deal registration. A partner registers an
 * opportunity, the channel team qualifies it, and the deal is protected for the
 * partner until it expires.
 */
export class PartnerDealsPage extends BasePage {
  protected readonly path = '/deals';

  readonly registerDeal: Locator;
  readonly dealsGrid: Locator;
  readonly stageTabs: Locator;
  readonly exportCsv: Locator;

  constructor(page: Page) {
    super(page);
    this.registerDeal = page.getByRole('button', { name: 'Register deal' });
    this.dealsGrid = page.getByRole('grid', { name: 'Deals' });
    this.stageTabs = page.getByRole('tablist', { name: 'Deal stage' });
    this.exportCsv = page.getByRole('button', { name: 'Export CSV' });
  }

  dealRow(customerName: string): Locator {
    return this.dealsGrid.getByRole('row').filter({ hasText: customerName });
  }

  async showStage(stage: DealStage | 'ALL'): Promise<void> {
    const label = stage === 'ALL' ? 'All' : stage.charAt(0) + stage.slice(1).toLowerCase();
    await this.stageTabs.getByRole('tab', { name: label }).click();
  }

  /**
   * Walks the three-step registration wizard and returns the new deal id.
   */
  async register(draft: DealDraft): Promise<string> {
    await this.registerDeal.click();
    const wizard = this.page.getByRole('dialog', { name: 'Register a deal' });

    await wizard.getByLabel('Customer legal name').fill(draft.customerName);
    await wizard.getByLabel('Customer website domain').fill(draft.customerDomain);
    await wizard.getByLabel('Decision-maker email').fill(draft.contactEmail);
    await wizard.getByRole('button', { name: 'Next' }).click();

    for (const sku of draft.products) {
      await wizard.getByRole('checkbox', { name: new RegExp(sku) }).check();
    }
    await wizard.getByLabel('Number of sites').fill(String(draft.siteCount));
    await wizard.getByLabel('Estimated monthly value').fill((draft.estimatedMonthlyValue.amountMinor / 100).toFixed(2));
    await wizard.getByRole('button', { name: 'Next' }).click();

    if (draft.notes) {
      await wizard.getByLabel('Notes for channel manager').fill(draft.notes);
    }
    await wizard.getByRole('checkbox', { name: /customer has consented/i }).check();
    const created = this.waitForApi('POST', '/api/v1/partner/deals');
    await wizard.getByRole('button', { name: 'Submit registration' }).click();
    const response = await created;
    if (response.status() !== 201) {
      return '';
    }
    const body = (await response.json()) as { id: string };
    await expect(wizard).toBeHidden();
    return body.id;
  }

  async expectDeal(customerName: string, stage: DealStage): Promise<void> {
    const row = this.dealRow(customerName);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('deal-stage')).toHaveAttribute('data-stage', stage);
  }

  async expectProtectionWindow(customerName: string, days: number): Promise<void> {
    const expires = await this.dealRow(customerName).getByTestId('deal-expires').getAttribute('datetime');
    expect(expires, 'deal expiry datetime attribute').not.toBeNull();
    const diffDays = Math.round((Date.parse(expires as string) - Date.now()) / 86_400_000);
    expect(diffDays).toBeGreaterThanOrEqual(days - 1);
    expect(diffDays).toBeLessThanOrEqual(days);
  }

  async expectDuplicateConflict(): Promise<void> {
    const wizard = this.page.getByRole('dialog', { name: 'Register a deal' });
    await expect(wizard.getByTestId('problem-banner')).toContainText(/already registered/i);
  }

  async openDeal(customerName: string): Promise<void> {
    await this.dealRow(customerName).getByRole('link', { name: customerName }).click();
    await expect(this.page.getByRole('heading', { level: 1 })).toHaveText(customerName);
  }

  async addActivityNote(note: string): Promise<void> {
    await this.page.getByRole('tab', { name: 'Activity' }).click();
    await this.page.getByLabel('Add a note').fill(note);
    await this.page.getByRole('button', { name: 'Post note' }).click();
    await expect(this.page.getByRole('list', { name: 'Activity timeline' })).toContainText(note);
  }

  async exportVisibleDeals(): Promise<string> {
    const downloadPromise = this.page.waitForEvent('download');
    await this.exportCsv.click();
    const download = await downloadPromise;
    return download.suggestedFilename();
  }
}
```

## qa/playwright/src/pages/SdwanChangeRequestPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/SdwanChangeRequestPage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { ChangeRequestDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * SD-WAN change requests. Changes against VeloCloud or Fortinet edges are never
 * applied directly from the portal: they are captured, approved by a
 * BUSINESS_ADMIN, and scheduled into a maintenance window.
 */
export class SdwanChangeRequestPage extends BasePage {
  protected readonly path = '/change-requests';

  readonly newRequest: Locator;
  readonly requestsTable: Locator;

  constructor(page: Page) {
    super(page);
    this.newRequest = page.getByRole('button', { name: 'New change request' });
    this.requestsTable = page.getByRole('table', { name: 'Change requests' });
  }

  row(changeRequestId: string): Locator {
    return this.tableRows(this.requestsTable).filter({ hasText: changeRequestId });
  }

  private get form(): Locator {
    return this.page.getByRole('form', { name: 'Change request' });
  }

  async startRequest(draft: ChangeRequestDraft): Promise<void> {
    await this.newRequest.click();
    await this.form.getByLabel('Site').selectOption({ label: draft.siteName });
    await this.form.getByRole('radiogroup', { name: 'Change type' }).getByRole('radio', { name: typeLabel(draft.type) }).check();
    if (draft.type === 'BANDWIDTH' && draft.newBandwidthMbps !== undefined) {
      await this.form.getByLabel('New committed bandwidth (Mbps)').fill(String(draft.newBandwidthMbps));
    }
    await this.form.getByLabel('Business justification').fill(draft.justification);
    await this.form.getByLabel('Maintenance window start (UTC)').fill(toDateTimeLocal(draft.scheduledFor));
  }

  async currentBandwidthMbps(): Promise<number> {
    const text = await this.form.getByTestId('current-bandwidth').textContent();
    return Number((text ?? '').replace(/[^0-9]/g, ''));
  }

  async expectImpactPreview(pattern: RegExp): Promise<void> {
    await this.form.getByRole('button', { name: 'Preview impact' }).click();
    await expect(this.page.getByRole('region', { name: 'Impact preview' })).toContainText(pattern);
  }

  async submit(): Promise<string> {
    const submit = this.waitForApi('POST', '/api/v1/sdwan/change-requests');
    await this.form.getByRole('button', { name: 'Submit for approval' }).click();
    const response = await submit;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    await this.expectToast(/submitted for approval/i);
    return body.id;
  }

  async submitExpectingValidation(field: string, message: RegExp): Promise<void> {
    await this.form.getByRole('button', { name: 'Submit for approval' }).click();
    const input = this.form.getByLabel(field);
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    expect(describedBy, `${field} should reference its error message`).toBeTruthy();
    await expect(this.page.locator(`#${describedBy}`)).toHaveText(message);
  }

  async expectStatus(changeRequestId: string, status: string): Promise<void> {
    await expect(this.row(changeRequestId).getByTestId('cr-status')).toHaveAttribute('data-status', status);
  }

  async approve(changeRequestId: string, comment: string): Promise<void> {
    await this.row(changeRequestId).getByRole('button', { name: 'Review' }).click();
    const dialog = this.page.getByRole('dialog', { name: `Review ${changeRequestId}` });
    await dialog.getByLabel('Approval comment').fill(comment);
    const approve = this.waitForApi('POST', `/change-requests/${changeRequestId}/approve`);
    await dialog.getByRole('button', { name: 'Approve and schedule' }).click();
    await approve;
    await expect(dialog).toBeHidden();
  }

  async reject(changeRequestId: string, reason: string): Promise<void> {
    await this.row(changeRequestId).getByRole('button', { name: 'Review' }).click();
    const dialog = this.page.getByRole('dialog', { name: `Review ${changeRequestId}` });
    await dialog.getByLabel('Approval comment').fill(reason);
    await dialog.getByRole('button', { name: 'Reject' }).click();
    await expect(dialog).toBeHidden();
  }
}

function typeLabel(type: ChangeRequestDraft['type']): string {
  return {
    BANDWIDTH: 'Bandwidth change',
    FIREWALL_RULE: 'Firewall rule',
    BUSINESS_POLICY: 'Business policy',
    EDGE_REPLACEMENT: 'Edge replacement',
  }[type];
}

function toDateTimeLocal(date: Date): string {
  return date.toISOString().slice(0, 16);
}
```

## qa/playwright/src/pages/TicketsPage.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/pages/TicketsPage.ts`.

```typescript
import { expect, Locator, Page } from '@playwright/test';
import { TicketPriority, TicketStatus } from '@api/domain';
import { TicketDraft } from '@data/builders';
import { BasePage } from './BasePage';

/**
 * Support tickets in Uconnect: list with filters, raise a new ticket, view the
 * conversation thread and respond while a ticket is PENDING_CUSTOMER.
 */
export class TicketsPage extends BasePage {
  protected readonly path = '/support/tickets';

  readonly raiseTicket: Locator;
  readonly ticketsTable: Locator;
  readonly search: Locator;
  readonly priorityFilter: Locator;

  constructor(page: Page) {
    super(page);
    this.raiseTicket = page.getByRole('button', { name: 'Raise a ticket' });
    this.ticketsTable = page.getByRole('table', { name: 'Support tickets' });
    this.search = page.getByRole('searchbox', { name: 'Search tickets' });
    this.priorityFilter = page.getByRole('combobox', { name: 'Priority' });
  }

  row(ticketIdOrSubject: string): Locator {
    return this.tableRows(this.ticketsTable).filter({ hasText: ticketIdOrSubject });
  }

  async create(draft: TicketDraft, serviceLabel?: string): Promise<string> {
    await this.raiseTicket.click();
    const form = this.page.getByRole('dialog', { name: 'Raise a ticket' });
    await form.getByLabel('Category').selectOption(draft.category);
    if (serviceLabel) {
      await form.getByLabel('Affected service').selectOption({ label: serviceLabel });
    }
    await form.getByLabel('Subject').fill(draft.subject);
    await form.getByLabel('Describe the issue').fill(draft.description);
    await form.getByRole('radiogroup', { name: 'Impact' }).getByRole('radio', { name: impactLabel(draft.priority) }).check();
    const created = this.waitForApi('POST', /\/tickets$/);
    await form.getByRole('button', { name: 'Submit ticket' }).click();
    const response = await created;
    expect(response.status()).toBe(201);
    const body = (await response.json()) as { id: string };
    await expect(form).toBeHidden();
    await this.expectToast(`Ticket ${body.id} created`);
    return body.id;
  }

  async submitEmptyForm(): Promise<Locator> {
    await this.raiseTicket.click();
    const form = this.page.getByRole('dialog', { name: 'Raise a ticket' });
    await form.getByRole('button', { name: 'Submit ticket' }).click();
    return form;
  }

  async searchFor(text: string): Promise<void> {
    const reload = this.waitForApi('GET', /tickets\?/);
    await this.search.fill(text);
    await this.search.press('Enter');
    await reload;
  }

  async filterByPriority(priority: TicketPriority): Promise<void> {
    await this.priorityFilter.selectOption(priority);
  }

  async expectRow(ticketId: string, status: TicketStatus, priority: TicketPriority): Promise<void> {
    const row = this.row(ticketId);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('ticket-status')).toHaveAttribute('data-status', status);
    await expect(row.getByTestId('ticket-priority')).toHaveText(priority);
  }

  async open(ticketId: string): Promise<void> {
    await this.row(ticketId).getByRole('link', { name: ticketId }).click();
    await expect(this.page.getByRole('heading', { name: new RegExp(ticketId) })).toBeVisible();
  }

  get thread(): Locator {
    return this.page.getByRole('feed', { name: 'Ticket conversation' }).getByRole('article');
  }

  async reply(message: string, attachment?: { name: string; mimeType: string; buffer: Buffer }): Promise<void> {
    await this.page.getByLabel('Your reply').fill(message);
    if (attachment) {
      await this.page.getByLabel('Attach files').setInputFiles(attachment);
      await expect(this.page.getByTestId('attachment-chip')).toBeVisible();
    }
    const send = this.waitForApi('POST', /\/comments$/);
    await this.page.getByRole('button', { name: 'Send reply' }).click();
    await send;
    await expect(this.thread.last()).toContainText(message);
  }

  async markResolved(): Promise<void> {
    await this.page.getByRole('button', { name: 'Mark as resolved' }).click();
    await this.page.getByRole('alertdialog').getByRole('button', { name: 'Confirm' }).click();
    await expect(this.page.getByTestId('ticket-detail-status')).toHaveAttribute('data-status', 'RESOLVED');
  }
}

function impactLabel(priority: TicketPriority): string {
  switch (priority) {
    case 'P1':
      return 'Total outage';
    case 'P2':
      return 'Severely degraded';
    case 'P3':
      return 'Partially affected';
    case 'P4':
      return 'Question or request';
  }
}
```

## qa/playwright/src/support/accessibility.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/support/accessibility.ts`.

```typescript
import AxeBuilder from '@axe-core/playwright';
import { expect, Page, TestInfo } from '@playwright/test';
import type { Result } from 'axe-core';

export interface A11yOptions {
  /** CSS selectors excluded from the scan, e.g. third-party widgets we do not own. */
  exclude?: string[];
  /** Rule ids temporarily disabled; each must reference a tracked defect. */
  disabledRules?: Array<{ id: string; ticket: string }>;
  /** Minimum impact that fails the test. */
  failOn?: Array<NonNullable<Result['impact']>>;
}

const DEFAULT_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Third-party embeds owned by vendors; scanned separately in their own contracts. */
const GLOBAL_EXCLUDES = ['#fs-root', '[data-clarity-region]', 'iframe[title="Secure card payment input frame"]'];

/**
 * Runs axe-core against the current page (WCAG 2.2 AA) and attaches the full
 * report to the test. Only violations at or above the configured impact fail.
 */
export async function expectAccessible(page: Page, testInfo: TestInfo, options: A11yOptions = {}): Promise<void> {
  let builder = new AxeBuilder({ page }).withTags(DEFAULT_TAGS);
  for (const selector of [...GLOBAL_EXCLUDES, ...(options.exclude ?? [])]) {
    builder = builder.exclude(selector);
  }
  if (options.disabledRules?.length) {
    builder = builder.disableRules(options.disabledRules.map((rule) => rule.id));
  }

  const results = await builder.analyze();
  await testInfo.attach('axe-results', {
    body: JSON.stringify(results, null, 2),
    contentType: 'application/json',
  });

  const failOn = options.failOn ?? ['serious', 'critical'];
  const blocking = results.violations.filter((violation) => violation.impact && failOn.includes(violation.impact));
  expect(blocking.map(summarise), `Accessibility violations on ${page.url()}`).toEqual([]);
}

function summarise(violation: Result): string {
  const targets = violation.nodes
    .slice(0, 3)
    .map((node) => node.target.join(' '))
    .join(' | ');
  return `[${violation.impact}] ${violation.id}: ${violation.help} -> ${targets}`;
}

/**
 * Tabs through the page and asserts every focused element shows a visible
 * focus indicator (outline or box-shadow), covering WCAG 2.4.7.
 */
export async function expectVisibleFocusOrder(page: Page, steps: number): Promise<string[]> {
  const visited: string[] = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        return null;
      }
      const style = window.getComputedStyle(el);
      const hasIndicator =
        (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0) || style.boxShadow !== 'none';
      const name = el.getAttribute('aria-label') ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
      return { name, hasIndicator };
    });
    if (!info) {
      continue;
    }
    expect(info.hasIndicator, `Focus indicator missing on "${info.name}"`).toBe(true);
    visited.push(info.name);
  }
  return visited;
}
```
