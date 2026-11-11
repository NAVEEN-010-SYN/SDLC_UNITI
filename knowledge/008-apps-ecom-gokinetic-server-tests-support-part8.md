# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/tests/support (part 8 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 1

## Files

- `apps/ecom-gokinetic/server/tests/support/world.js` (94 lines)

## apps/ecom-gokinetic/server/tests/support/world.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/tests/support/world.js`.

```javascript
'use strict';

const baseConfig = require('../../src/config');
const { createContainer } = require('../../src/container');
const f = require('./fakes');

/** Config tuned for fast tests (cheap bcrypt) without touching env vars. */
const testConfig = Object.freeze({
  ...baseConfig,
  auth: { ...baseConfig.auth, bcryptRounds: 4, jwtSecret: 'test-secret-test-secret' },
});

function memoryIdempotency() {
  const rows = new Map();
  return {
    rows,
    async begin({ key, scope, requestHash }) {
      const id = `${scope}:${key}`;
      if (rows.has(id)) return rows.get(id);
      rows.set(id, { key, scope, requestHash, state: 'IN_PROGRESS' });
      return null;
    },
    async complete({ key, scope, responseStatus, responseBody }) {
      Object.assign(rows.get(`${scope}:${key}`), { state: 'COMPLETED', responseStatus, responseBody });
    },
    async release({ key, scope }) {
      const id = `${scope}:${key}`;
      if (rows.get(id) && rows.get(id).state === 'IN_PROGRESS') rows.delete(id);
    },
  };
}

const CONSUMER_ACCOUNT = { accountId: 'ACC-00000001', segment: 'CONSUMER', displayName: 'Ada Lovelace' };
const BUSINESS_ACCOUNT = { accountId: 'ACC-00000002', segment: 'BUSINESS', displayName: 'Acme Corp', businessName: 'Acme Corp' };

const principals = {
  consumer: { id: 'u-consumer', accountId: 'ACC-00000001', roles: ['CONSUMER'], segment: 'CONSUMER', email: 'ada@example.com' },
  otherConsumer: { id: 'u-other', accountId: 'ACC-00000099', roles: ['CONSUMER'], segment: 'CONSUMER' },
  businessAdmin: { id: 'u-badmin', accountId: 'ACC-00000002', roles: ['BUSINESS_ADMIN'], segment: 'BUSINESS', email: 'ops@acme.example' },
  agent: { id: 'u-agent-1', accountId: null, roles: ['SUPPORT_AGENT'], segment: null },
  agent2: { id: 'u-agent-2', accountId: null, roles: ['SUPPORT_AGENT'], segment: null },
};

/**
 * Builds the real service graph over in-memory repositories and fake
 * integrations. Every collaborator is exposed for assertions.
 */
function createWorld({
  catalogue = f.CATALOGUE,
  accounts = [CONSUMER_ACCOUNT, BUSINESS_ACCOUNT],
  users = [],
  promos = [],
  serviceabilityByZip = {},
  config = testConfig,
} = {}) {
  const repos = {
    products: f.memoryProducts(catalogue),
    carts: f.memoryCarts(),
    orders: f.memoryOrders(),
    promos: f.memoryPromos(promos),
    quotes: f.memoryQuotes(),
    invoices: f.memoryInvoices(),
    users: f.memoryUsers(users),
    accounts: f.memoryAccounts(accounts),
    sessions: f.memorySessions(),
    serviceabilityChecks: f.memoryServiceabilityChecks(),
    idempotency: memoryIdempotency(),
    emailLog: { record: async () => {}, wasSent: async () => false },
  };
  const gateway = f.fakePaymentGateway();
  const api = f.fakeServiceabilityApi(serviceabilityByZip);
  const notifier = f.fakeNotifier();
  const container = createContainer(config, { ...repos, paymentGateway: gateway, serviceabilityApi: api, notifier });
  return { ...container, repos, gateway, api, notifier };
}

/** Builds a checked-out-ready cart for `principal` and places the order. */
async function placeOrder(world, principal, { items = [{ sku: 'GK-FIBRE-1000', quantity: 1 }], address = f.ADDRESS, term = 0, promoCode } = {}) {
  const { cartService, checkoutService } = world.services;
  const { cart } = await cartService.create({ segment: principal.segment }, principal);
  for (const item of items) await cartService.addItem(cart.id, item, principal, null);
  await cartService.setContractTerm(cart.id, { contractTermMonths: term }, principal, null);
  await cartService.setServiceAddress(cart.id, { address }, principal, null);
  if (promoCode) await cartService.applyPromo(cart.id, { code: promoCode }, principal, null);
  return checkoutService.placeOrder(principal, {
    cartId: cart.id,
    paymentToken: 'tok_visa_4242',
    contact: { email: 'ada@example.com', phone: '5125550100', firstName: 'Ada', lastName: 'Lovelace' },
    acceptTerms: true,
  });
}

module.exports = { createWorld, placeOrder, principals, testConfig, memoryIdempotency, CONSUMER_ACCOUNT, BUSINESS_ACCOUNT };
```
