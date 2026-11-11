# QA automation and API specs: qa (part 2 of 5)

- **Application:** QA automation and API specs
- **Tech stack:** Playwright, Selenium (Java), Postman, Swagger/OpenAPI
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 13

## Files

- `qa/playwright/src/support/schema.ts` (107 lines)
- `qa/playwright/tests/a11y/accessibility.spec.ts` (69 lines)
- `qa/playwright/tests/api/orders-tickets.api.spec.ts` (122 lines)
- `qa/playwright/tests/auth.setup.ts` (38 lines)
- `qa/playwright/tests/ecom/catalogue-checkout.spec.ts` (137 lines)
- `qa/playwright/tests/partner/deals.spec.ts` (92 lines)
- `qa/playwright/tests/sdwan/change-request.spec.ts` (89 lines)
- `qa/playwright/tests/uconnect/billing.spec.ts` (96 lines)
- `qa/playwright/tests/uconnect/tickets.spec.ts` (92 lines)
- `qa/playwright/tsconfig.json` (26 lines)
- `qa/postman/README.md` (34 lines)
- `qa/postman/collections/ecom-orders.postman_collection.json` (362 lines)
- `qa/postman/collections/partner-sdwan.postman_collection.json` (365 lines)

## qa/playwright/src/support/schema.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/src/support/schema.ts`.

```typescript
import Ajv, { ErrorObject, JSONSchemaType } from 'ajv';
import addFormats from 'ajv-formats';
import { expect } from '@playwright/test';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);

const moneySchema = {
  type: 'object',
  required: ['amountMinor', 'currency'],
  properties: {
    amountMinor: { type: 'integer' },
    currency: { type: 'string', pattern: '^[A-Z]{3}$' },
  },
  additionalProperties: false,
} as const;

export const schemas = {
  problem: {
    type: 'object',
    required: ['type', 'title', 'status'],
    properties: {
      type: { type: 'string', format: 'uri-reference' },
      title: { type: 'string', minLength: 1 },
      status: { type: 'integer', minimum: 400, maximum: 599 },
      detail: { type: 'string' },
      instance: { type: 'string' },
      correlationId: { type: 'string' },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['field', 'message'],
          properties: { field: { type: 'string' }, message: { type: 'string' } },
        },
      },
    },
  },
  order: {
    type: 'object',
    required: ['id', 'accountId', 'status', 'lines', 'total', 'createdAt'],
    properties: {
      id: { type: 'string', pattern: '^ORD-\\d{8}$' },
      accountId: { type: 'string', pattern: '^ACC-\\d{8}$' },
      status: { enum: ['DRAFT', 'SUBMITTED', 'VALIDATED', 'PROVISIONING', 'ACTIVE', 'CANCELLED', 'FAILED'] },
      lines: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['sku', 'quantity'],
          properties: { sku: { type: 'string' }, quantity: { type: 'integer', minimum: 1 } },
        },
      },
      total: moneySchema,
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  ticket: {
    type: 'object',
    required: ['id', 'accountId', 'subject', 'priority', 'status', 'createdAt'],
    properties: {
      id: { type: 'string', pattern: '^TCK-\\d{8}$' },
      accountId: { type: 'string', pattern: '^ACC-\\d{8}$' },
      subject: { type: 'string', minLength: 1, maxLength: 200 },
      priority: { enum: ['P1', 'P2', 'P3', 'P4'] },
      status: { enum: ['OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER', 'RESOLVED', 'CLOSED'] },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  page: {
    type: 'object',
    required: ['items', 'page', 'pageSize', 'total'],
    properties: {
      items: { type: 'array' },
      page: { type: 'integer', minimum: 1 },
      pageSize: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 },
    },
  },
} as const;

export type SchemaName = keyof typeof schemas;

const compiled = new Map<SchemaName, ReturnType<typeof ajv.compile>>();

function validator(name: SchemaName) {
  let fn = compiled.get(name);
  if (!fn) {
    fn = ajv.compile(schemas[name] as unknown as JSONSchemaType<unknown>);
    compiled.set(name, fn);
  }
  return fn;
}

function describe(errors: ErrorObject[] | null | undefined): string[] {
  return (errors ?? []).map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim());
}

/** Asserts that a JSON payload matches one of the contract schemas above. */
export function expectSchema(name: SchemaName, payload: unknown): void {
  const validate = validator(name);
  const valid = validate(payload);
  expect(describe(validate.errors), `payload should satisfy "${name}" schema`).toEqual([]);
  expect(valid).toBe(true);
}
```

## qa/playwright/tests/a11y/accessibility.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/a11y/accessibility.spec.ts`.

```typescript
import { test } from '@playwright/test';
import { PortalKey, portals } from '../../src/config/portals';
import { expectAccessible, expectVisibleFocusOrder } from '../../src/support/accessibility';

/**
 * WCAG 2.2 AA scan of the key landing pages of each portal, run as the
 * portal's default persona. Unauthenticated pages are scanned with an empty
 * storage state.
 */
interface PageUnderTest {
  portal: PortalKey;
  path: string;
  name: string;
  authenticated: boolean;
}

const PAGES: PageUnderTest[] = [
  { portal: 'ecom', path: '/plans', name: 'eCom plan catalogue', authenticated: false },
  { portal: 'ecom', path: '/account/login', name: 'eCom sign-in', authenticated: false },
  { portal: 'ecom', path: '/account', name: 'eCom account home', authenticated: true },
  { portal: 'uconnect', path: '/dashboard', name: 'Uconnect dashboard', authenticated: true },
  { portal: 'uconnect', path: '/billing', name: 'Uconnect billing', authenticated: true },
  { portal: 'uconnect', path: '/support/tickets', name: 'Uconnect tickets', authenticated: true },
  { portal: 'partner', path: '/deals', name: 'Partner deals', authenticated: true },
];

for (const target of PAGES) {
  test.describe(`${target.name} @a11y`, () => {
    const portal = portals[target.portal];
    test.use({
      baseURL: portal.baseURL,
      storageState: target.authenticated ? portal.storageState : { cookies: [], origins: [] },
    });

    test('has no serious or critical WCAG violations', async ({ page }, testInfo) => {
      await page.goto(target.path);
      await page.getByRole('main').waitFor();
      await expectAccessible(page, testInfo);
    });
  });
}

test.describe('Keyboard navigation @a11y', () => {
  test.use({ baseURL: portals.ecom.baseURL, storageState: { cookies: [], origins: [] } });

  test('skip link is first in the tab order and moves focus to main', async ({ page }) => {
    await page.goto('/plans');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to main content' });
    await skip.waitFor();
    await page.keyboard.press('Enter');
    const focusedInMain = await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement));
    test.expect(focusedInMain).toBe(true);
  });

  test('every focusable control in the header shows a focus indicator', async ({ page }) => {
    await page.goto('/plans');
    const visited = await expectVisibleFocusOrder(page, 12);
    test.expect(visited.length).toBeGreaterThan(5);
  });

  test('plan catalogue remains usable at 200% zoom without horizontal scroll', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 900 });
    await page.goto('/plans');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    test.expect(overflow).toBeLessThanOrEqual(0);
  });
});
```

## qa/playwright/tests/api/orders-tickets.api.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/api/orders-tickets.api.spec.ts`.

```typescript
import { test, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import { ApiClient, ApiError } from '../../src/api/apiClient';
import { SeedApi } from '../../src/api/seedApi';
import { Order, Ticket } from '../../src/api/domain';
import { AddressBuilder, OrderBuilder, TicketBuilder } from '../../src/data/builders';
import { expectSchema } from '../../src/support/schema';

/**
 * Contract-level API checks that complement the Postman collections: schema
 * conformance, problem+json errors, pagination envelope and correlation-id echo.
 */
const ACCOUNT_ID = process.env.API_TEST_ACCOUNT_ID ?? 'ACC-00010042';

test.describe('Orders API @api', () => {
  let api: ApiClient;
  let seed: SeedApi;
  const created: string[] = [];

  test.beforeAll(async () => {
    api = await ApiClient.create();
    seed = new SeedApi(api);
  });

  test.afterAll(async () => {
    for (const id of created) {
      await seed.cancelOrder(id).catch(() => undefined);
    }
    await api.dispose();
  });

  test('POST /orders returns 201 with a schema-valid order', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).withPlan('FIB-1000').build());
    created.push(order.id);
    expectSchema('order', order);
    expect(order.status).toBe('SUBMITTED');
  });

  test('order total is integer minor units and matches line pricing', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).withPlan('FIB-500').withAddOn('STATIC-IP').build());
    created.push(order.id);
    const products = await seed.listProducts('B2C');
    const priceOf = (sku: string) => products.items.find((p) => p.sku === sku)?.monthlyPrice.amountMinor ?? 0;
    const expected = order.lines.reduce((sum, line) => sum + priceOf(line.sku) * line.quantity, 0);
    expect(Number.isInteger(order.total.amountMinor)).toBe(true);
    expect(order.total.amountMinor).toBe(expected);
  });

  test('out-of-footprint address is rejected with 422 problem+json', async () => {
    const draft = OrderBuilder.forAccount(ACCOUNT_ID).at(AddressBuilder.outOfFootprint().build()).build();
    const response = await api.raw('POST', '/api/v1/orders', { body: draft });
    expect(response.status()).toBe(422);
    expect(response.headers()['content-type']).toContain('application/problem+json');
    const problem = await response.json();
    expectSchema('problem', problem);
    expect(problem.errors).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'serviceAddress' })]));
  });

  test('missing lines fails validation at the boundary', async () => {
    const draft = { ...OrderBuilder.forAccount(ACCOUNT_ID).build(), lines: [] };
    const error = await seed.createOrder(draft).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
  });

  test('cancelling a submitted order moves it to CANCELLED', async () => {
    const order = await seed.createOrder(OrderBuilder.forAccount(ACCOUNT_ID).build());
    const cancelled: Order = await seed.cancelOrder(order.id);
    expect(cancelled.status).toBe('CANCELLED');
  });

  test('correlation id supplied by the caller is echoed back', async () => {
    const correlationId = randomUUID();
    const response = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, {
      correlationId,
      query: { page: 1, pageSize: 5 },
    });
    expect(response.ok()).toBeTruthy();
    expect(response.headers()['x-correlation-id']).toBe(correlationId);
  });

  test('order list honours the pagination envelope and bounds', async () => {
    const response = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, { query: { page: 1, pageSize: 2 } });
    const body = await response.json();
    expectSchema('page', body);
    expect(body.items.length).toBeLessThanOrEqual(2);

    const tooLarge = await api.raw('GET', `/api/v1/accounts/${ACCOUNT_ID}/orders`, { query: { page: 1, pageSize: 1000 } });
    expect(tooLarge.status()).toBe(400);
  });
});

test.describe('Tickets API @api', () => {
  let api: ApiClient;
  let seed: SeedApi;

  test.beforeAll(async () => {
    api = await ApiClient.create();
    seed = new SeedApi(api);
  });

  test.afterAll(async () => api.dispose());

  test('ticket lifecycle transitions are enforced', async () => {
    const ticket: Ticket = await seed.createTicket(ACCOUNT_ID, TicketBuilder.connectivity().build());
    expectSchema('ticket', ticket);

    const invalid = await api.raw('PATCH', `/api/v1/tickets/${ticket.id}`, { body: { status: 'PENDING_CUSTOMER' } });
    expect(invalid.status(), 'OPEN -> PENDING_CUSTOMER skips IN_PROGRESS').toBe(409);
    expectSchema('problem', await invalid.json());

    const closed = await seed.closeTicket(ticket.id);
    expect(closed.status).toBe('CLOSED');
  });

  test('unauthenticated request returns 401 problem+json', async ({ request }) => {
    const response = await request.get(`/api/v1/accounts/${ACCOUNT_ID}/tickets`);
    expect(response.status()).toBe(401);
    expect(response.headers()['www-authenticate']).toContain('Bearer');
  });
});
```

## qa/playwright/tests/auth.setup.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/auth.setup.ts`.

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { test as setup, expect } from '@playwright/test';
import { credentialsFor } from '../src/config/env';
import { PortalKey, portals } from '../src/config/portals';
import { LoginPage } from '../src/pages/LoginPage';

/**
 * Signs each portal's default persona in once and saves storage state so the
 * portal project can reuse the session. The portal comes from the setup
 * project's metadata. A cached state younger than 30 minutes is reused.
 */
const MAX_STATE_AGE_MS = 30 * 60 * 1000;

setup('authenticate default persona', async ({ page }, testInfo) => {
  const portalKey = testInfo.project.metadata.portal as PortalKey;
  const portal = portals[portalKey];
  expect(portal, `unknown portal "${portalKey}" in project metadata`).toBeDefined();

  if (fs.existsSync(portal.storageState)) {
    const age = Date.now() - fs.statSync(portal.storageState).mtimeMs;
    if (age < MAX_STATE_AGE_MS) {
      setup.skip(true, `reusing ${path.basename(portal.storageState)} (${Math.round(age / 1000)}s old)`);
    }
  }

  const login = new LoginPage(page, portal);
  await login.signInAndLand(credentialsFor(portal.defaultRole));

  const me = await page.request.get('/api/v1/me');
  expect(me.ok(), 'profile endpoint after sign-in').toBeTruthy();
  const profile = (await me.json()) as { roles: string[] };
  expect(profile.roles).toContain(portal.defaultRole);

  fs.mkdirSync(path.dirname(portal.storageState), { recursive: true });
  await page.context().storageState({ path: portal.storageState });
});
```

## qa/playwright/tests/ecom/catalogue-checkout.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/ecom/catalogue-checkout.spec.ts`.

```typescript
import { test, expect } from '@fixtures/test';
import { AddressBuilder } from '@data/builders';

/**
 * Residential buy flow on GoKinetic: qualify address -> choose plan -> add-on
 * -> checkout -> order lands in SUBMITTED and progresses to VALIDATED.
 */

const SANDBOX_CARD = { number: '4242424242424242', expiry: '12 / 34', cvc: '123', postalCode: '72201' };

const CONTACT = {
  firstName: 'Quinn',
  lastName: 'Ashford',
  email: 'qa.consumer+checkout@example.net',
  phone: '5015550142',
};

test.describe('Catalogue and checkout @ecom', () => {
  test.beforeEach(async ({ catalogue }) => {
    await catalogue.goto();
  });

  test('serviceable address shows fibre plans in ascending speed order @smoke', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.expectServiceable();

    const names = await catalogue.visiblePlanNames();
    const speeds = names.map((name) => {
      const match = name.match(/(\d+)\s*(Mbps|Gbps)/);
      expect(match, `plan name "${name}" should state a speed`).not.toBeNull();
      const [, value, unit] = match as RegExpMatchArray;
      return Number(value) * (unit === 'Gbps' ? 1000 : 1);
    });
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b));
  });

  test('out-of-footprint address offers waitlist instead of plans', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.outOfFootprint().build());
    await catalogue.expectNotServiceable();
    await expect(catalogue.planCards).toHaveCount(0);
  });

  test('speed filter narrows the plan grid', async ({ catalogue }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.filterBySpeed('1 Gbps');
    const names = await catalogue.visiblePlanNames();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toContain('1 Gbps');
    }
  });

  test('plan price on the card matches the catalogue API', async ({ catalogue, seed }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    const products = await seed.listProducts('B2C');
    const plan = products.items.find((product) => product.sku === 'FIB-500');
    expect(plan, 'FIB-500 should be in the B2C catalogue').toBeDefined();

    const expected = new Intl.NumberFormat('en-US', { style: 'currency', currency: plan!.monthlyPrice.currency }).format(
      plan!.monthlyPrice.amountMinor / 100,
    );
    expect(await catalogue.planPrice('FIB-500')).toContain(expected);
  });

  test('complete residential checkout creates a submitted order @smoke', async ({ catalogue, checkout, seed, cleanup }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-1000');
    await catalogue.addOn('Whole-home Wi-Fi');
    await catalogue.continueToCheckout();

    await checkout.fillContact(CONTACT);
    const slot = await checkout.chooseFirstInstallSlot();
    expect(slot).not.toBe('');
    await checkout.payWithSandboxCard(SANDBOX_CARD);
    await checkout.expectSummaryContains('1 Gbps', 'Whole-home Wi-Fi');

    const orderId = await checkout.submitOrder();
    cleanup(() => seed.cancelOrder(orderId));

    const order = await seed.getOrder(orderId);
    expect(['SUBMITTED', 'VALIDATED']).toContain(order.status);
    expect(order.lines.map((line) => line.sku)).toEqual(expect.arrayContaining(['FIB-1000', 'WIFI-MESH']));
    expect(Number.isInteger(order.total.amountMinor)).toBe(true);

    const validated = await seed.waitForOrderStatus(orderId, 'VALIDATED');
    expect(validated.serviceAddress.postalCode).toBe('72201');
  });

  test('order cannot be placed until terms are accepted', async ({ catalogue, checkout }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.fillContact(CONTACT);
    await checkout.chooseFirstInstallSlot();
    await checkout.payWithSandboxCard(SANDBOX_CARD);
    await checkout.expectPlaceOrderBlockedUntilTermsAccepted();
  });

  test('declined sandbox card surfaces a problem banner and keeps the cart', async ({ catalogue, checkout, page }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.fillContact(CONTACT);
    await checkout.chooseFirstInstallSlot();
    await checkout.payWithSandboxCard({ ...SANDBOX_CARD, number: '4000000000000002' });

    await checkout.expectProblem(/payment was declined/i);
    expect(await checkout.problemCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
    await expect(page).toHaveURL(/\/checkout\/payment/);
    await page.goto('/plans');
    expect(await catalogue.cartCount()).toBe(1);
  });

  test('invalid promo code is rejected with a field-level message', async ({ catalogue, checkout }) => {
    await catalogue.qualifyAddress(AddressBuilder.serviceable().build());
    await catalogue.selectPlan('FIB-500');
    await catalogue.continueToCheckout();
    await checkout.applyPromoCode('NOT-A-REAL-CODE');
    await expect(checkout.summary.getByText(/promo code is not valid/i)).toBeVisible();
  });
});

test.describe('Business catalogue @ecom', () => {
  test('business segment shows only B2B plans with contract terms', async ({ page, seed }) => {
    const { CataloguePage } = await import('@pages/CataloguePage');
    const business = new CataloguePage(page, 'business');
    await business.goto();
    await business.qualifyAddress(AddressBuilder.serviceable().withUnit('Suite 400').build());
    await business.expectServiceable();

    const products = await seed.listProducts('B2B');
    const broadband = products.items.filter((product) => product.category === 'BROADBAND');
    await expect(business.planCards).toHaveCount(broadband.length);
    await expect(business.planCards.first().getByTestId('contract-term')).toHaveText(/\d+-month term/);
  });
});
```

## qa/playwright/tests/partner/deals.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/partner/deals.spec.ts`.

```typescript
import { test, expect } from '@fixtures/test';
import { DealBuilder } from '@data/builders';
import { credentialsFor } from '@config/env';
import { portals } from '@config/portals';
import { LoginPage } from '@pages/LoginPage';
import { PartnerDealsPage } from '@pages/PartnerDealsPage';

/**
 * Enterprise Partner Portal deal registration. Registered deals are protected
 * for 90 days; a second partner cannot register the same customer domain.
 */
const PROTECTION_DAYS = 90;

test.describe('Partner deal registration @partner', () => {
  test.beforeEach(async ({ deals }) => {
    await deals.goto();
  });

  test('partner admin registers a multi-site SD-WAN deal @smoke', async ({ deals, seed, cleanup }) => {
    const draft = DealBuilder.enterprise()
      .withProducts('FIB-BIZ-1G', 'SDWAN-VC-STD')
      .withSites(5)
      .withMonthlyValue(489_500)
      .withNotes('Customer is consolidating five branch circuits before fiscal year end.')
      .build();

    const dealId = await deals.register(draft);
    expect(dealId).toMatch(/^DEAL-\d{8}$/);
    cleanup(() => seed.withdrawDeal(dealId));

    await deals.showStage('REGISTERED');
    await deals.expectDeal(draft.customerName, 'REGISTERED');
    await deals.expectProtectionWindow(draft.customerName, PROTECTION_DAYS);
  });

  test('registering an already-protected customer domain is rejected', async ({ deals, seed, cleanup }) => {
    const original = DealBuilder.enterprise().build();
    const existing = await seed.registerDeal(original);
    cleanup(() => seed.withdrawDeal(existing.id));

    const duplicate = DealBuilder.enterprise()
      .withCustomer(`${original.customerName} Holdings`, original.customerDomain)
      .build();
    const dealId = await deals.register(duplicate);
    expect(dealId).toBe('');
    await deals.expectDuplicateConflict();
  });

  test('activity notes are recorded on the deal timeline', async ({ deals, seed, cleanup }) => {
    const deal = await seed.registerDeal(DealBuilder.enterprise().build());
    cleanup(() => seed.withdrawDeal(deal.id));

    await deals.goto();
    await deals.openDeal(deal.customerName);
    await deals.addActivityNote('Site survey booked for the Conway and Benton branches.');
  });

  test('CSV export is named for the partner and date', async ({ deals }) => {
    const filename = await deals.exportVisibleDeals();
    const today = new Date().toISOString().slice(0, 10);
    expect(filename).toMatch(new RegExp(`^deals-PTR-\\d{6}-${today}\\.csv$`));
  });

  test('stage tabs filter the grid', async ({ deals, page }) => {
    await deals.showStage('WON');
    const stages = await deals.dealsGrid.getByTestId('deal-stage').evaluateAll((cells) =>
      cells.map((cell) => cell.getAttribute('data-stage')),
    );
    for (const stage of stages) {
      expect(stage).toBe('WON');
    }
    await expect(page).toHaveURL(/stage=WON/);
  });
});

test.describe('Partner agent permissions @partner', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('partner agent sees deals read-only and cannot register', async ({ page }) => {
    const login = new LoginPage(page, portals.partner);
    await login.signInAndLand(credentialsFor('PARTNER_AGENT'));

    const deals = new PartnerDealsPage(page);
    await deals.goto();
    await expect(deals.registerDeal).toHaveCount(0);

    const response = await page.request.post('/api/v1/partner/deals', { data: DealBuilder.enterprise().build() });
    expect(response.status()).toBe(403);
    expect(response.headers()['content-type']).toContain('application/problem+json');
  });
});
```

## qa/playwright/tests/sdwan/change-request.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/sdwan/change-request.spec.ts`.

```typescript
import { test, expect } from '@fixtures/test';
import { bandwidthChange } from '@data/builders';

/**
 * SD-WAN change request journey: capture -> preview impact -> submit for
 * approval -> approve -> scheduled into a maintenance window.
 */
test.describe('SD-WAN change requests @sdwan', () => {
  let siteName: string;

  test.beforeEach(async ({ changeRequests, seed, profile }) => {
    const sites = await seed.listSites(profile.accountId);
    const online = sites.items.find((site) => site.status === 'ONLINE' && site.vendor === 'VELOCLOUD');
    test.skip(!online, 'no ONLINE VeloCloud site on the test account');
    siteName = online!.name;
    await changeRequests.goto();
  });

  test('bandwidth upgrade is submitted for approval @smoke', async ({ changeRequests, seed, cleanup }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 500));
    expect(await changeRequests.currentBandwidthMbps()).toBeLessThan(500);
    await changeRequests.expectImpactPreview(/monthly charge will increase/i);

    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    expect(id).toMatch(/^CR-\d{8}$/);
    await changeRequests.expectStatus(id, 'PENDING_APPROVAL');
    const stored = await seed.getChangeRequest(id);
    expect(stored.type).toBe('BANDWIDTH');
  });

  test('approval schedules the change into the requested window', async ({ changeRequests, seed, cleanup }) => {
    const draft = bandwidthChange(siteName, 300);
    await changeRequests.startRequest(draft);
    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    await changeRequests.approve(id, 'Approved by QA as BUSINESS_ADMIN.');
    await changeRequests.expectStatus(id, 'SCHEDULED');

    const stored = await seed.getChangeRequest(id);
    expect(stored.status).toBe('SCHEDULED');
    expect(stored.scheduledFor).toBe(draft.scheduledFor.toISOString());
  });

  test('rejected change records the reason and is not scheduled', async ({ changeRequests, seed, cleanup }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 1000));
    const id = await changeRequests.submit();
    cleanup(() => seed.withdrawChangeRequest(id));

    await changeRequests.reject(id, 'Exceeds the contracted burst ceiling for this site.');
    await changeRequests.expectStatus(id, 'REJECTED');
    expect((await seed.getChangeRequest(id)).scheduledFor).toBeUndefined();
  });

  test('bandwidth above the edge model limit is blocked client-side', async ({ changeRequests }) => {
    await changeRequests.startRequest(bandwidthChange(siteName, 20_000));
    await changeRequests.submitExpectingValidation('New committed bandwidth (Mbps)', /exceeds the maximum supported/i);
  });

  test('maintenance window in the past is rejected', async ({ changeRequests }) => {
    const draft = bandwidthChange(siteName, 300);
    draft.scheduledFor = new Date(Date.now() - 3_600_000);
    await changeRequests.startRequest(draft);
    await changeRequests.submitExpectingValidation('Maintenance window start (UTC)', /must be in the future/i);
  });

  test('server-side conflict for an overlapping change is surfaced', async ({ changeRequests, page }) => {
    await page.route('**/api/v1/sdwan/change-requests', async (route) => {
      if (route.request().method() !== 'POST') {
        return route.continue();
      }
      return route.fulfill({
        status: 409,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://errors.uniti.example/sdwan/change-window-conflict',
          title: 'Another change is already scheduled for this site',
          status: 409,
        }),
      });
    });
    await changeRequests.startRequest(bandwidthChange(siteName, 300));
    await page.getByRole('button', { name: 'Submit for approval' }).click();
    await changeRequests.expectProblem('Another change is already scheduled for this site');
  });
});
```

## qa/playwright/tests/uconnect/billing.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/uconnect/billing.spec.ts`.

```typescript
import * as fs from 'fs';
import { test, expect } from '@fixtures/test';
import { formatMoney } from '@data/builders';

/**
 * Uconnect billing journeys for a BUSINESS_ADMIN: balance, invoice history,
 * filtering, pagination, PDF download and payments.
 */
test.describe('Billing @uconnect', () => {
  test.beforeEach(async ({ billing }) => {
    await billing.goto();
  });

  test('invoice list matches the billing API for the signed-in account @smoke', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const rows = billing.invoiceRows();
    await expect(rows).toHaveCount(Math.min(invoices.items.length, invoices.pageSize));

    const newest = invoices.items[0];
    const row = billing.invoiceRow(newest.id);
    await expect(row).toContainText(formatMoney(newest.amountDue));
    await expect(row.getByTestId('invoice-status')).toHaveText(newest.status.charAt(0) + newest.status.slice(1).toLowerCase());
  });

  test('outstanding balance equals the sum of issued and overdue invoices', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const open = invoices.items.filter((invoice) => invoice.status === 'ISSUED' || invoice.status === 'OVERDUE');
    const totalMinor = open.reduce((sum, invoice) => sum + invoice.amountDue.amountMinor, 0);
    const currency = invoices.items[0]?.amountDue.currency ?? 'USD';
    expect(await billing.outstandingBalance()).toBe(formatMoney({ amountMinor: totalMinor, currency }));
  });

  test('status filter shows only paid invoices', async ({ billing }) => {
    await billing.filterByStatus('Paid');
    await billing.expectAllRowsHaveStatus('Paid');
  });

  test('pagination moves to the second page of history', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    test.skip(invoices.total <= invoices.pageSize, 'account has a single page of invoices');
    const firstPageIds = await billing.invoiceRows().getByRole('link').allTextContents();
    await billing.goToPage(2);
    const secondPageIds = await billing.invoiceRows().getByRole('link').allTextContents();
    expect(secondPageIds.some((id) => firstPageIds.includes(id))).toBe(false);
  });

  test('invoice detail line items add up to the invoice total', async ({ billing, seed, profile, page }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const invoice = invoices.items[0];
    await billing.openInvoice(invoice.id);

    const items = await billing.invoiceLineItems();
    expect(items.length).toBeGreaterThan(0);
    const sumMinor = items
      .map((item) => Math.round(Number(item.amount.replace(/[^0-9.-]/g, '')) * 100))
      .reduce((a, b) => a + b, 0);
    expect(sumMinor).toBe(invoice.amountDue.amountMinor);
    await expect(page.getByTestId('invoice-total')).toHaveText(formatMoney(invoice.amountDue));
  });

  test('invoice PDF downloads with a PDF signature', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    const download = await billing.downloadInvoicePdf(invoices.items[0].id);
    const file = await download.path();
    expect(file).not.toBeNull();
    const header = fs.readFileSync(file as string).subarray(0, 5).toString('ascii');
    expect(header).toBe('%PDF-');
  });

  test('paying the balance with a saved method returns a payment reference', async ({ billing, seed, profile }) => {
    const invoices = await seed.listInvoices(profile.accountId);
    test.skip(!invoices.items.some((invoice) => invoice.status !== 'PAID'), 'nothing outstanding on this account');
    const reference = await billing.payOutstandingWithSavedMethod('4242');
    expect(reference).toMatch(/^PAY-[A-Z0-9]{10}$/);
    await billing.expectToast(/payment received/i);
  });

  test('billing API failure renders a problem banner with a correlation id', async ({ billing, page }) => {
    await page.route('**/api/v1/accounts/*/invoices*', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/problem+json',
        body: JSON.stringify({
          type: 'https://errors.uniti.example/billing-unavailable',
          title: 'Billing is temporarily unavailable',
          status: 503,
          correlationId: '7d0c5b2e-2f43-4d0e-9a52-0f7cd0c1f5a1',
        }),
      }),
    );
    await page.reload();
    await billing.expectProblem('Billing is temporarily unavailable');
    expect(await billing.problemCorrelationId()).toBe('7d0c5b2e-2f43-4d0e-9a52-0f7cd0c1f5a1');
  });
});
```

## qa/playwright/tests/uconnect/tickets.spec.ts

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: typescript. Path: `qa/playwright/tests/uconnect/tickets.spec.ts`.

```typescript
import { test, expect } from '@fixtures/test';
import { TicketBuilder } from '@data/builders';

/**
 * Support ticket lifecycle in Uconnect:
 * OPEN -> IN_PROGRESS -> PENDING_CUSTOMER -> RESOLVED -> CLOSED.
 */
test.describe('Support tickets @uconnect', () => {
  test.beforeEach(async ({ tickets }) => {
    await tickets.goto();
  });

  test('raise a connectivity ticket from the portal @smoke', async ({ tickets, seed, cleanup }) => {
    const draft = TicketBuilder.connectivity().withPriority('P2').build();
    const ticketId = await tickets.create(draft);
    cleanup(() => seed.closeTicket(ticketId));

    expect(ticketId).toMatch(/^TCK-\d{8}$/);
    await tickets.expectRow(ticketId, 'OPEN', 'P2');

    const stored = await seed.getTicket(ticketId);
    expect(stored.subject).toBe(draft.subject);
    expect(stored.category).toBe('CONNECTIVITY');
  });

  test('required fields are validated before submission', async ({ tickets }) => {
    const form = await tickets.submitEmptyForm();
    await expect(form.getByLabel('Subject')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByLabel('Describe the issue')).toHaveAttribute('aria-invalid', 'true');
    await expect(form.getByRole('alert')).toContainText('Please fix 2 errors');
  });

  test('ticket created via API appears in search results', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.billingDispute().build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.searchFor(created.id);
    await tickets.expectRow(created.id, 'OPEN', 'P3');
    await expect(tickets.row(created.id)).toContainText('Duplicate charge');
  });

  test('priority filter shows only matching tickets', async ({ tickets, seed, profile, cleanup }) => {
    const p1 = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P1').build());
    const p4 = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P4').build());
    cleanup(() => seed.closeTicket(p1.id));
    cleanup(() => seed.closeTicket(p4.id));

    await tickets.goto();
    await tickets.filterByPriority('P1');
    await expect(tickets.row(p1.id)).toBeVisible();
    await expect(tickets.row(p4.id)).toHaveCount(0);
  });

  test('customer reply with attachment is added to the thread', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.goto();
    await tickets.open(created.id);
    const ontLog = [
      '2026-11-10T18:02:11Z LOS alarm raised on PON port 1',
      '2026-11-10T18:02:47Z LOS alarm cleared, ranging complete',
      '2026-11-10T19:15:03Z LOS alarm raised on PON port 1',
    ].join('\n');
    await tickets.reply('ONT event log attached. The PON light flashes red during the drop-outs.', {
      name: 'ont-events.log',
      mimeType: 'text/plain',
      buffer: Buffer.from(ontLog, 'utf-8'),
    });
    await expect(tickets.thread).toHaveCount(2);
    await expect(tickets.thread.last().getByRole('link', { name: 'ont-events.log' })).toBeVisible();
  });

  test('customer can resolve their own ticket', async ({ tickets, seed, profile, cleanup }) => {
    const created = await seed.createTicket(profile.accountId, TicketBuilder.connectivity().withPriority('P4').build());
    cleanup(() => seed.closeTicket(created.id));

    await tickets.goto();
    await tickets.open(created.id);
    await tickets.markResolved();

    const stored = await seed.getTicket(created.id);
    expect(stored.status).toBe('RESOLVED');
  });

  test('tickets belonging to another account are not reachable', async ({ page }) => {
    const response = await page.goto('/support/tickets/TCK-00000001');
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole('heading', { name: /ticket not found/i })).toBeVisible();
  });
});
```

## qa/playwright/tsconfig.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/playwright/tsconfig.json`.

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@pages/*": ["src/pages/*"],
      "@api/*": ["src/api/*"],
      "@data/*": ["src/data/*"],
      "@fixtures/*": ["src/fixtures/*"],
      "@config/*": ["src/config/*"],
      "@support/*": ["src/support/*"]
    }
  },
  "include": ["playwright.config.ts", "src/**/*.ts", "tests/**/*.ts"]
}
```

## qa/postman/README.md

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: markdown. Path: `qa/postman/README.md`.

````markdown
# Postman collections

| Collection | API | Flow |
|---|---|---|
| `ecom-orders` | eCom (MERN) | catalogue paging, serviceability, order create -> get -> cancel, validation and transition errors |
| `uconnect-account` | Uconnect (.NET 8) | account, services, invoices, PDF, payment validation, ticket lifecycle |
| `partner-sdwan` | Enterprise Partner Portal, SD-WAN | deal register/duplicate/list/withdraw, site list, change request create/approve/withdraw |

Each collection carries:

- **Collection pre-request**: fetches a client-credentials token (cached until
  60 s before expiry) and stamps a fresh `X-Correlation-Id` on every request.
- **Collection test**: asserts the correlation id is echoed and that every 4xx/5xx
  is `application/problem+json` with `type`, `title`, `status`.
- **Request tests**: status, JSON schema, domain rules (integer minor units,
  canonical ids such as `ORD-########`, lifecycle transitions).

Requests within a folder are ordered and chain through collection variables
(`orderId`, `ticketId`, `dealId`, `changeRequestId`), so run folders in order.

## Running with Newman

```bash
npx newman run collections/ecom-orders.postman_collection.json \
  -e environments/dev.postman_environment.json \
  --env-var oidcClientId=$OIDC_CLIENT_ID \
  --env-var oidcClientSecret=$OIDC_CLIENT_SECRET \
  --reporters cli,junit --reporter-junit-export reports/ecom.xml
```

Secret values in the environment files are intentionally blank; inject them from
the CI secret store with `--env-var`. Never export a populated environment back
into the repository.
````

## qa/postman/collections/ecom-orders.postman_collection.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/postman/collections/ecom-orders.postman_collection.json`.

```json
{
  "info": {
    "_postman_id": "6a1f0d8e-3c2b-4b7e-9f1a-0e5d2c7b4a01",
    "name": "Uniti eCom - Catalogue & Orders",
    "description": "GoKinetic eCom API: catalogue, serviceability, cart and order lifecycle (DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE). Run with the dev or staging environment. Requests chain through collection variables (orderId).",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [{ "key": "token", "value": "{{accessToken}}", "type": "string" }]
  },
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "// Fetch (or reuse) a client-credentials token and stamp a correlation id on every request.",
          "const now = Date.now();",
          "const expiresAt = Number(pm.collectionVariables.get('accessTokenExpiresAt') || 0);",
          "if (!pm.collectionVariables.get('accessToken') || expiresAt - 60000 < now) {",
          "  pm.sendRequest({",
          "    url: pm.environment.get('oidcTokenUrl'),",
          "    method: 'POST',",
          "    header: { 'Content-Type': 'application/x-www-form-urlencoded' },",
          "    body: {",
          "      mode: 'urlencoded',",
          "      urlencoded: [",
          "        { key: 'grant_type', value: 'client_credentials' },",
          "        { key: 'client_id', value: pm.environment.get('oidcClientId') },",
          "        { key: 'client_secret', value: pm.environment.get('oidcClientSecret') },",
          "        { key: 'scope', value: pm.environment.get('oidcScope') }",
          "      ]",
          "    }",
          "  }, (err, res) => {",
          "    if (err || res.code !== 200) {",
          "      throw new Error('Token request failed: ' + (err || res.status));",
          "    }",
          "    const body = res.json();",
          "    pm.collectionVariables.set('accessToken', body.access_token);",
          "    pm.collectionVariables.set('accessTokenExpiresAt', String(now + body.expires_in * 1000));",
          "  });",
          "}",
          "const correlationId = pm.variables.replaceIn('{{$guid}}');",
          "pm.variables.set('correlationId', correlationId);",
          "pm.request.headers.upsert({ key: 'X-Correlation-Id', value: correlationId });",
          "pm.request.headers.upsert({ key: 'Accept', value: 'application/json, application/problem+json' });"
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('correlation id is echoed', () => {",
          "  pm.expect(pm.response.headers.get('X-Correlation-Id')).to.eql(pm.variables.get('correlationId'));",
          "});",
          "pm.test('response time under SLO (800 ms)', () => {",
          "  pm.expect(pm.response.responseTime).to.be.below(800);",
          "});",
          "if (pm.response.code >= 400) {",
          "  pm.test('errors are RFC 7807 problem+json', () => {",
          "    pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json');",
          "    const problem = pm.response.json();",
          "    pm.expect(problem).to.include.keys('type', 'title', 'status');",
          "    pm.expect(problem.status).to.eql(pm.response.code);",
          "  });",
          "}"
        ]
      }
    }
  ],
  "variable": [
    { "key": "accessToken", "value": "" },
    { "key": "accessTokenExpiresAt", "value": "0" },
    { "key": "orderId", "value": "" }
  ],
  "item": [
    {
      "name": "Catalogue",
      "item": [
        {
          "name": "List B2C products (paged)",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const schema = {",
                  "  type: 'object',",
                  "  required: ['items', 'page', 'pageSize', 'total'],",
                  "  properties: {",
                  "    page: { type: 'integer', minimum: 1 },",
                  "    pageSize: { type: 'integer', maximum: 100 },",
                  "    total: { type: 'integer', minimum: 0 },",
                  "    items: { type: 'array', items: {",
                  "      type: 'object',",
                  "      required: ['sku', 'name', 'category', 'monthlyPrice', 'segment'],",
                  "      properties: {",
                  "        monthlyPrice: { type: 'object', required: ['amountMinor', 'currency'], properties: { amountMinor: { type: 'integer' }, currency: { type: 'string', pattern: '^[A-Z]{3}$' } } },",
                  "        segment: { enum: ['B2C'] }",
                  "      }",
                  "    } }",
                  "  }",
                  "};",
                  "pm.test('matches paged product schema', () => pm.response.to.have.jsonSchema(schema));",
                  "pm.test('pageSize honoured', () => pm.expect(pm.response.json().items.length).to.be.at.most(20));"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/catalogue/products?segment=B2C&page=1&pageSize=20",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "catalogue", "products"],
              "query": [
                { "key": "segment", "value": "B2C" },
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "20" }
              ]
            }
          }
        },
        {
          "name": "Reject oversize pageSize",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('400 Bad Request', () => pm.response.to.have.status(400));",
                  "pm.test('field error references pageSize', () => {",
                  "  const fields = (pm.response.json().errors || []).map(e => e.field);",
                  "  pm.expect(fields).to.include('pageSize');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/catalogue/products?page=1&pageSize=500",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "catalogue", "products"],
              "query": [
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "500" }
              ]
            }
          }
        },
        {
          "name": "Check serviceability",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const body = pm.response.json();",
                  "pm.test('address is serviceable with max speed', () => {",
                  "  pm.expect(body.serviceable).to.be.true;",
                  "  pm.expect(body.maxDownloadMbps).to.be.a('number').and.at.least(100);",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"line1\": \"1200 Fibre Way\",\n  \"city\": \"Little Rock\",\n  \"state\": \"AR\",\n  \"postalCode\": \"72201\",\n  \"country\": \"US\"\n}"
            },
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/catalogue/serviceability",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "catalogue", "serviceability"]
            }
          }
        }
      ]
    },
    {
      "name": "Orders",
      "item": [
        {
          "name": "Create order",
          "event": [
            {
              "listen": "prerequest",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.variables.set('externalReference', 'QA-PM-' + Date.now());"
                ]
              }
            },
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('201 Created with Location', () => {",
                  "  pm.response.to.have.status(201);",
                  "  pm.expect(pm.response.headers.get('Location')).to.match(/\\/api\\/v1\\/orders\\/ORD-\\d{8}$/);",
                  "});",
                  "const order = pm.response.json();",
                  "pm.test('order is SUBMITTED with integer total', () => {",
                  "  pm.expect(order.id).to.match(/^ORD-\\d{8}$/);",
                  "  pm.expect(order.status).to.eql('SUBMITTED');",
                  "  pm.expect(Number.isInteger(order.total.amountMinor)).to.be.true;",
                  "  pm.expect(order.createdAt).to.match(/Z$/);",
                  "});",
                  "pm.collectionVariables.set('orderId', order.id);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [
              { "key": "Content-Type", "value": "application/json" },
              { "key": "Idempotency-Key", "value": "{{externalReference}}" }
            ],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"accountId\": \"{{accountId}}\",\n  \"externalReference\": \"{{externalReference}}\",\n  \"lines\": [\n    { \"sku\": \"FIB-1000\", \"quantity\": 1 },\n    { \"sku\": \"WIFI-MESH\", \"quantity\": 1 }\n  ],\n  \"serviceAddress\": {\n    \"line1\": \"1200 Fibre Way\",\n    \"city\": \"Little Rock\",\n    \"state\": \"AR\",\n    \"postalCode\": \"72201\",\n    \"country\": \"US\"\n  }\n}"
            },
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/orders",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "orders"]
            }
          }
        },
        {
          "name": "Get order",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "pm.test('returns the created order', () => {",
                  "  const order = pm.response.json();",
                  "  pm.expect(order.id).to.eql(pm.collectionVariables.get('orderId'));",
                  "  pm.expect(['SUBMITTED', 'VALIDATED', 'PROVISIONING']).to.include(order.status);",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/orders/{{orderId}}",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "orders", "{{orderId}}"]
            }
          }
        },
        {
          "name": "Create order - empty lines rejected",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('400 with lines field error', () => {",
                  "  pm.response.to.have.status(400);",
                  "  const fields = pm.response.json().errors.map(e => e.field);",
                  "  pm.expect(fields).to.include('lines');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"accountId\": \"{{accountId}}\",\n  \"externalReference\": \"QA-PM-EMPTY\",\n  \"lines\": [],\n  \"serviceAddress\": { \"line1\": \"1200 Fibre Way\", \"city\": \"Little Rock\", \"state\": \"AR\", \"postalCode\": \"72201\", \"country\": \"US\" }\n}"
            },
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/orders",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "orders"]
            }
          }
        },
        {
          "name": "Cancel order",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK and CANCELLED', () => {",
                  "  pm.response.to.have.status(200);",
                  "  pm.expect(pm.response.json().status).to.eql('CANCELLED');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": { "mode": "raw", "raw": "{\n  \"reason\": \"QA_CLEANUP\"\n}" },
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/orders/{{orderId}}/cancel",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "orders", "{{orderId}}", "cancel"]
            }
          }
        },
        {
          "name": "Cancel already-cancelled order conflicts",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('409 Conflict', () => pm.response.to.have.status(409));",
                  "pm.test('problem type identifies invalid transition', () => {",
                  "  pm.expect(pm.response.json().type).to.include('invalid-order-transition');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": { "mode": "raw", "raw": "{\n  \"reason\": \"QA_CLEANUP\"\n}" },
            "url": {
              "raw": "{{ecomApiBaseUrl}}/api/v1/orders/{{orderId}}/cancel",
              "host": ["{{ecomApiBaseUrl}}"],
              "path": ["api", "v1", "orders", "{{orderId}}", "cancel"]
            }
          }
        }
      ]
    }
  ]
}
```

## qa/postman/collections/partner-sdwan.postman_collection.json

Application: QA automation and API specs. Stack: Playwright, Selenium (Java), Postman, Swagger/OpenAPI. Language: json. Path: `qa/postman/collections/partner-sdwan.postman_collection.json`.

```json
{
  "info": {
    "_postman_id": "c7e3f0b8-2a7d-4b4f-9e6c-8d0f1a2b3c03",
    "name": "Uniti Partner Portal & SD-WAN",
    "description": "Enterprise Partner Portal deal registration and commission APIs, plus SD-WAN site inventory and change-request approval flow. Partner calls use a PARTNER_ADMIN token obtained with the password grant against the test IdP; SD-WAN calls use the client-credentials token.",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "auth": {
    "type": "bearer",
    "bearer": [{ "key": "token", "value": "{{accessToken}}", "type": "string" }]
  },
  "event": [
    {
      "listen": "prerequest",
      "script": {
        "type": "text/javascript",
        "exec": [
          "const now = Date.now();",
          "const expiresAt = Number(pm.collectionVariables.get('accessTokenExpiresAt') || 0);",
          "if (!pm.collectionVariables.get('accessToken') || expiresAt - 60000 < now) {",
          "  pm.sendRequest({",
          "    url: pm.environment.get('oidcTokenUrl'),",
          "    method: 'POST',",
          "    header: { 'Content-Type': 'application/x-www-form-urlencoded' },",
          "    body: { mode: 'urlencoded', urlencoded: [",
          "      { key: 'grant_type', value: 'client_credentials' },",
          "      { key: 'client_id', value: pm.environment.get('oidcClientId') },",
          "      { key: 'client_secret', value: pm.environment.get('oidcClientSecret') },",
          "      { key: 'scope', value: pm.environment.get('oidcScope') }",
          "    ] }",
          "  }, (err, res) => {",
          "    if (err || res.code !== 200) { throw new Error('Token request failed: ' + (err || res.status)); }",
          "    const body = res.json();",
          "    pm.collectionVariables.set('accessToken', body.access_token);",
          "    pm.collectionVariables.set('accessTokenExpiresAt', String(now + body.expires_in * 1000));",
          "  });",
          "}",
          "const correlationId = pm.variables.replaceIn('{{$guid}}');",
          "pm.variables.set('correlationId', correlationId);",
          "pm.request.headers.upsert({ key: 'X-Correlation-Id', value: correlationId });"
        ]
      }
    },
    {
      "listen": "test",
      "script": {
        "type": "text/javascript",
        "exec": [
          "pm.test('correlation id is echoed', () => {",
          "  pm.expect(pm.response.headers.get('X-Correlation-Id')).to.eql(pm.variables.get('correlationId'));",
          "});",
          "if (pm.response.code >= 400) {",
          "  pm.test('errors are RFC 7807 problem+json', () => {",
          "    pm.expect(pm.response.headers.get('Content-Type')).to.include('application/problem+json');",
          "    pm.expect(pm.response.json()).to.include.keys('type', 'title', 'status');",
          "  });",
          "}"
        ]
      }
    }
  ],
  "variable": [
    { "key": "accessToken", "value": "" },
    { "key": "accessTokenExpiresAt", "value": "0" },
    { "key": "partnerToken", "value": "" },
    { "key": "dealId", "value": "" },
    { "key": "customerDomain", "value": "" },
    { "key": "siteId", "value": "" },
    { "key": "changeRequestId", "value": "" }
  ],
  "item": [
    {
      "name": "Partner",
      "auth": {
        "type": "bearer",
        "bearer": [{ "key": "token", "value": "{{partnerToken}}", "type": "string" }]
      },
      "event": [
        {
          "listen": "prerequest",
          "script": {
            "type": "text/javascript",
            "exec": [
              "// Partner endpoints need a user token carrying PARTNER_ADMIN and the partner id claim.",
              "if (!pm.collectionVariables.get('partnerToken')) {",
              "  pm.sendRequest({",
              "    url: pm.environment.get('oidcTokenUrl'),",
              "    method: 'POST',",
              "    header: { 'Content-Type': 'application/x-www-form-urlencoded' },",
              "    body: { mode: 'urlencoded', urlencoded: [",
              "      { key: 'grant_type', value: 'password' },",
              "      { key: 'client_id', value: pm.environment.get('partnerTestClientId') },",
              "      { key: 'username', value: pm.environment.get('partnerAdminUsername') },",
              "      { key: 'password', value: pm.environment.get('partnerAdminPassword') },",
              "      { key: 'scope', value: 'openid partner.deals partner.commissions' }",
              "    ] }",
              "  }, (err, res) => {",
              "    if (err || res.code !== 200) { throw new Error('Partner token request failed'); }",
              "    pm.collectionVariables.set('partnerToken', res.json().access_token);",
              "  });",
              "}"
            ]
          }
        }
      ],
      "item": [
        {
          "name": "Register deal",
          "event": [
            {
              "listen": "prerequest",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "const tag = 'qa-pm-' + Date.now().toString(36);",
                  "pm.collectionVariables.set('customerDomain', tag + '.qa.example.net');",
                  "pm.variables.set('customerName', 'QA Freight ' + tag.toUpperCase());"
                ]
              }
            },
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('201 Created', () => pm.response.to.have.status(201));",
                  "const deal = pm.response.json();",
                  "pm.test('deal REGISTERED with 90-day protection', () => {",
                  "  pm.expect(deal.id).to.match(/^DEAL-\\d{8}$/);",
                  "  pm.expect(deal.stage).to.eql('REGISTERED');",
                  "  const days = Math.round((Date.parse(deal.expiresAt) - Date.now()) / 86400000);",
                  "  pm.expect(days).to.be.within(89, 90);",
                  "});",
                  "pm.collectionVariables.set('dealId', deal.id);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"customerName\": \"{{customerName}}\",\n  \"customerDomain\": \"{{customerDomain}}\",\n  \"contactEmail\": \"it-lead@{{customerDomain}}\",\n  \"products\": [\"FIB-BIZ-1G\", \"SDWAN-VC-STD\"],\n  \"siteCount\": 3,\n  \"estimatedMonthlyValue\": { \"amountMinor\": 249900, \"currency\": \"USD\" }\n}"
            },
            "url": {
              "raw": "{{partnerApiBaseUrl}}/api/v1/partner/deals",
              "host": ["{{partnerApiBaseUrl}}"],
              "path": ["api", "v1", "partner", "deals"]
            }
          }
        },
        {
          "name": "Register duplicate domain conflicts",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('409 Conflict', () => pm.response.to.have.status(409));",
                  "pm.test('problem type deal-already-registered', () => {",
                  "  pm.expect(pm.response.json().type).to.include('deal-already-registered');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"customerName\": \"Duplicate Holdings\",\n  \"customerDomain\": \"{{customerDomain}}\",\n  \"contactEmail\": \"ops@{{customerDomain}}\",\n  \"products\": [\"FIB-BIZ-500\"],\n  \"siteCount\": 1,\n  \"estimatedMonthlyValue\": { \"amountMinor\": 49900, \"currency\": \"USD\" }\n}"
            },
            "url": {
              "raw": "{{partnerApiBaseUrl}}/api/v1/partner/deals",
              "host": ["{{partnerApiBaseUrl}}"],
              "path": ["api", "v1", "partner", "deals"]
            }
          }
        },
        {
          "name": "List registered deals",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const body = pm.response.json();",
                  "pm.test('only REGISTERED deals returned', () => body.items.forEach(d => pm.expect(d.stage).to.eql('REGISTERED')));",
                  "pm.test('new deal is listed', () => pm.expect(body.items.map(d => d.id)).to.include(pm.collectionVariables.get('dealId')));"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{partnerApiBaseUrl}}/api/v1/partner/deals?stage=REGISTERED&page=1&pageSize=100",
              "host": ["{{partnerApiBaseUrl}}"],
              "path": ["api", "v1", "partner", "deals"],
              "query": [
                { "key": "stage", "value": "REGISTERED" },
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "100" }
              ]
            }
          }
        },
        {
          "name": "Withdraw deal",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": ["pm.test('204 No Content', () => pm.response.to.have.status(204));"]
              }
            }
          ],
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{partnerApiBaseUrl}}/api/v1/partner/deals/{{dealId}}",
              "host": ["{{partnerApiBaseUrl}}"],
              "path": ["api", "v1", "partner", "deals", "{{dealId}}"]
            }
          }
        }
      ]
    },
    {
      "name": "SD-WAN",
      "item": [
        {
          "name": "List sites",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK', () => pm.response.to.have.status(200));",
                  "const sites = pm.response.json().items;",
                  "pm.test('vendor is VeloCloud or Fortinet', () => sites.forEach(s => pm.expect(['VELOCLOUD', 'FORTINET']).to.include(s.vendor)));",
                  "const online = sites.find(s => s.status === 'ONLINE');",
                  "pm.test('at least one ONLINE site', () => pm.expect(online).to.not.be.undefined);",
                  "if (online) { pm.collectionVariables.set('siteId', online.id); }"
                ]
              }
            }
          ],
          "request": {
            "method": "GET",
            "url": {
              "raw": "{{sdwanApiBaseUrl}}/api/v1/sdwan/sites?accountId={{accountId}}&page=1&pageSize=25",
              "host": ["{{sdwanApiBaseUrl}}"],
              "path": ["api", "v1", "sdwan", "sites"],
              "query": [
                { "key": "accountId", "value": "{{accountId}}" },
                { "key": "page", "value": "1" },
                { "key": "pageSize", "value": "25" }
              ]
            }
          }
        },
        {
          "name": "Create bandwidth change request",
          "event": [
            {
              "listen": "prerequest",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "const window = new Date(Date.now() + 3 * 86400000);",
                  "window.setUTCHours(2, 0, 0, 0);",
                  "pm.variables.set('scheduledFor', window.toISOString());"
                ]
              }
            },
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('201 Created', () => pm.response.to.have.status(201));",
                  "const cr = pm.response.json();",
                  "pm.test('pending approval', () => {",
                  "  pm.expect(cr.id).to.match(/^CR-\\d{8}$/);",
                  "  pm.expect(cr.status).to.eql('PENDING_APPROVAL');",
                  "});",
                  "pm.collectionVariables.set('changeRequestId', cr.id);"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": {
              "mode": "raw",
              "raw": "{\n  \"siteId\": \"{{siteId}}\",\n  \"type\": \"BANDWIDTH\",\n  \"parameters\": { \"committedBandwidthMbps\": 500 },\n  \"justification\": \"QA-PM seasonal traffic growth\",\n  \"scheduledFor\": \"{{scheduledFor}}\"\n}"
            },
            "url": {
              "raw": "{{sdwanApiBaseUrl}}/api/v1/sdwan/change-requests",
              "host": ["{{sdwanApiBaseUrl}}"],
              "path": ["api", "v1", "sdwan", "change-requests"]
            }
          }
        },
        {
          "name": "Approve change request",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": [
                  "pm.test('200 OK and SCHEDULED', () => {",
                  "  pm.response.to.have.status(200);",
                  "  pm.expect(pm.response.json().status).to.eql('SCHEDULED');",
                  "});"
                ]
              }
            }
          ],
          "request": {
            "method": "POST",
            "header": [{ "key": "Content-Type", "value": "application/json" }],
            "body": { "mode": "raw", "raw": "{\n  \"comment\": \"Approved by QA collection run.\"\n}" },
            "url": {
              "raw": "{{sdwanApiBaseUrl}}/api/v1/sdwan/change-requests/{{changeRequestId}}/approve",
              "host": ["{{sdwanApiBaseUrl}}"],
              "path": ["api", "v1", "sdwan", "change-requests", "{{changeRequestId}}", "approve"]
            }
          }
        },
        {
          "name": "Withdraw scheduled change request",
          "event": [
            {
              "listen": "test",
              "script": {
                "type": "text/javascript",
                "exec": ["pm.test('204 No Content', () => pm.response.to.have.status(204));"]
              }
            }
          ],
          "request": {
            "method": "DELETE",
            "url": {
              "raw": "{{sdwanApiBaseUrl}}/api/v1/sdwan/change-requests/{{changeRequestId}}",
              "host": ["{{sdwanApiBaseUrl}}"],
              "path": ["api", "v1", "sdwan", "change-requests", "{{changeRequestId}}"]
            }
          }
        }
      ]
    }
  ]
}
```
