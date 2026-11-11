# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 3 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 18

## Files

- `apps/ecom-gokinetic/server/src/config/logger.js` (87 lines)
- `apps/ecom-gokinetic/server/src/container.js` (169 lines)
- `apps/ecom-gokinetic/server/src/controllers/accountController.js` (63 lines)
- `apps/ecom-gokinetic/server/src/controllers/authController.js` (48 lines)
- `apps/ecom-gokinetic/server/src/controllers/cartController.js` (62 lines)
- `apps/ecom-gokinetic/server/src/controllers/catalogController.js` (56 lines)
- `apps/ecom-gokinetic/server/src/controllers/orderController.js` (51 lines)
- `apps/ecom-gokinetic/server/src/controllers/quoteController.js` (51 lines)
- `apps/ecom-gokinetic/server/src/domain/address.js` (120 lines)
- `apps/ecom-gokinetic/server/src/domain/billing.js` (199 lines)
- `apps/ecom-gokinetic/server/src/domain/billing.test.js` (109 lines)
- `apps/ecom-gokinetic/server/src/domain/constants.js` (120 lines)
- `apps/ecom-gokinetic/server/src/domain/identifiers.js` (58 lines)
- `apps/ecom-gokinetic/server/src/domain/installWindows.js` (178 lines)
- `apps/ecom-gokinetic/server/src/domain/installWindows.test.js` (72 lines)
- `apps/ecom-gokinetic/server/src/domain/money.js` (163 lines)
- `apps/ecom-gokinetic/server/src/domain/money.test.js` (47 lines)
- `apps/ecom-gokinetic/server/src/domain/orderTracking.js` (87 lines)

## apps/ecom-gokinetic/server/src/config/logger.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/config/logger.js`.

```javascript
'use strict';

/**
 * Minimal structured JSON logger.
 *
 * Every line is a single JSON object containing a timestamp, level, message and
 * (when available) the correlation id of the current request, so logs can be
 * joined across services in Kibana / Dynatrace.
 */

const { AsyncLocalStorage } = require('node:async_hooks');

const LEVELS = { error: 50, warn: 40, info: 30, debug: 20, trace: 10 };

const requestContext = new AsyncLocalStorage();

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'accesstoken',
  'refreshtoken',
  'authorization',
  'cardtoken',
  'paymenttoken',
  'apikey',
]);

/**
 * Recursively replaces values of sensitive keys with a redaction marker.
 * @param {unknown} value
 * @param {number} depth
 * @returns {unknown}
 */
function redact(value, depth = 0) {
  if (depth > 6 || value === null || typeof value !== 'object') return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));
  const out = {};
  for (const [key, inner] of Object.entries(value)) {
    out[key] = SENSITIVE_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : redact(inner, depth + 1);
  }
  return out;
}

function createLogger({ level = 'info', bindings = {}, sink = process.stdout } = {}) {
  const threshold = LEVELS[level] ?? LEVELS.info;

  function write(lvl, message, fields) {
    if (LEVELS[lvl] < threshold) return;
    const store = requestContext.getStore();
    const entry = {
      ts: new Date().toISOString(),
      level: lvl,
      msg: message,
      service: 'ecom-gokinetic-api',
      ...bindings,
      ...(store && store.correlationId ? { correlationId: store.correlationId } : {}),
      ...(fields ? redact(fields) : {}),
    };
    sink.write(`${JSON.stringify(entry)}\n`);
  }

  return {
    error: (msg, fields) => write('error', msg, fields),
    warn: (msg, fields) => write('warn', msg, fields),
    info: (msg, fields) => write('info', msg, fields),
    debug: (msg, fields) => write('debug', msg, fields),
    trace: (msg, fields) => write('trace', msg, fields),
    child: (extra) => createLogger({ level, bindings: { ...bindings, ...extra }, sink }),
  };
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info'),
});

/** Returns the correlation id bound to the current async context, if any. */
function currentCorrelationId() {
  const store = requestContext.getStore();
  return store ? store.correlationId : undefined;
}

module.exports = { logger, createLogger, requestContext, currentCorrelationId, redact };
```

## apps/ecom-gokinetic/server/src/container.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/container.js`.

```javascript
'use strict';

const { createProductRepository } = require('./repositories/productRepository');
const { createCartRepository } = require('./repositories/cartRepository');
const { createOrderRepository } = require('./repositories/orderRepository');
const { createPromoRepository } = require('./repositories/promoRepository');
const { createQuoteRepository } = require('./repositories/quoteRepository');
const { createInvoiceRepository } = require('./repositories/invoiceRepository');
const {
  createUserRepository,
  createAccountRepository,
  createSessionRepository,
} = require('./repositories/identityRepositories');
const {
  createServiceabilityRepository,
  createIdempotencyRepository,
  createEmailLogRepository,
} = require('./repositories/infraRepositories');

const { createPaymentGatewayClient } = require('./integrations/paymentGatewayClient');
const { createServiceabilityApiClient } = require('./integrations/serviceabilityApiClient');
const { createEmailNotifier } = require('./integrations/emailNotifier');

const { createAuthService } = require('./services/authService');
const { createCatalogService } = require('./services/catalogService');
const { createServiceabilityService } = require('./services/serviceabilityService');
const { createPromoService } = require('./services/promoService');
const { createCartService } = require('./services/cartService');
const { createCheckoutService } = require('./services/checkoutService');
const { createOrderService } = require('./services/orderService');
const { createQuoteService } = require('./services/quoteService');
const { createAccountService } = require('./services/accountService');
const { createInvoiceService } = require('./services/invoiceService');
const { createInstallSchedulingService } = require('./services/installSchedulingService');

/**
 * Composition root: wires repositories, upstream clients and services.
 *
 * `overrides` lets tests (or alternative deployments) swap any dependency by
 * name, e.g. `{ paymentGateway: fakeGateway }`, without touching the graph.
 *
 * @param {object} config validated runtime config (src/config)
 * @param {object} [overrides]
 */
function createContainer(config, overrides = {}) {
  const pick = (name, factory) => (overrides[name] !== undefined ? overrides[name] : factory());

  const repos = {
    products: pick('products', () => createProductRepository()),
    carts: pick('carts', () => createCartRepository()),
    orders: pick('orders', () => createOrderRepository()),
    promos: pick('promos', () => createPromoRepository()),
    quotes: pick('quotes', () => createQuoteRepository()),
    invoices: pick('invoices', () => createInvoiceRepository()),
    users: pick('users', () => createUserRepository()),
    accounts: pick('accounts', () => createAccountRepository()),
    sessions: pick('sessions', () => createSessionRepository()),
    serviceabilityChecks: pick('serviceabilityChecks', () => createServiceabilityRepository()),
    idempotency: pick('idempotency', () => createIdempotencyRepository()),
    emailLog: pick('emailLog', () => createEmailLogRepository()),
  };

  const paymentGateway = pick('paymentGateway', () => createPaymentGatewayClient(config.paymentGateway));
  const serviceabilityApi = pick('serviceabilityApi', () => createServiceabilityApiClient(config.serviceability));
  const notifier = pick('notifier', () => createEmailNotifier({ ...config.email, emailLog: repos.emailLog }));

  const authService = pick('authService', () =>
    createAuthService({ users: repos.users, accounts: repos.accounts, sessions: repos.sessions, authConfig: config.auth }),
  );
  const serviceability = pick('serviceabilityService', () =>
    createServiceabilityService({
      repository: repos.serviceabilityChecks,
      apiClient: serviceabilityApi,
      products: repos.products,
      cacheTtlHours: config.serviceability.cacheTtlHours,
    }),
  );
  const catalogService = pick('catalogService', () => createCatalogService({ products: repos.products, serviceability }));
  const promoService = pick('promoService', () => createPromoService({ promos: repos.promos, accounts: repos.accounts }));
  const cartService = pick('cartService', () =>
    createCartService({
      carts: repos.carts,
      products: repos.products,
      accounts: repos.accounts,
      serviceability,
      promoService,
      cartTtlHours: config.commerce.cartTtlHours,
    }),
  );
  const checkoutService = pick('checkoutService', () =>
    createCheckoutService({
      cartService,
      serviceability,
      products: repos.products,
      orders: repos.orders,
      promoService,
      paymentGateway,
      notifier,
    }),
  );
  const orderService = pick('orderService', () =>
    createOrderService({
      orders: repos.orders,
      accounts: repos.accounts,
      products: repos.products,
      promoService,
      paymentGateway,
      serviceability,
      serviceabilityApi,
      notifier,
    }),
  );
  const quoteService = pick('quoteService', () =>
    createQuoteService({
      quotes: repos.quotes,
      products: repos.products,
      orders: repos.orders,
      accounts: repos.accounts,
      serviceability,
      paymentGateway,
      notifier,
      approvalThresholdBps: config.commerce.quoteApprovalDiscountBps,
      validityDays: config.commerce.quoteValidityDays,
      portalBaseUrl: config.urls.businessPortal,
    }),
  );
  const accountService = pick('accountService', () =>
    createAccountService({
      users: repos.users,
      accounts: repos.accounts,
      serviceability,
      notifier,
      authConfig: config.auth,
      maxUsersPerBusinessAccount: config.billing.maxUsersPerBusinessAccount,
      businessPortalUrl: config.urls.businessPortal,
    }),
  );
  const invoiceService = pick('invoiceService', () =>
    createInvoiceService({
      invoices: repos.invoices,
      orders: repos.orders,
      accounts: repos.accounts,
      consumerDueDays: config.billing.consumerDueDays,
    }),
  );
  const installScheduling = pick('installScheduling', () => createInstallSchedulingService({ serviceability }));

  return {
    config,
    repos,
    notifier,
    services: {
      authService,
      serviceability,
      catalogService,
      promoService,
      cartService,
      checkoutService,
      orderService,
      quoteService,
      accountService,
      invoiceService,
      installScheduling,
    },
  };
}

module.exports = { createContainer };
```

## apps/ecom-gokinetic/server/src/controllers/accountController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/accountController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Account self-service, invoices and promo administration endpoints. */
function createAccountController({ accountService, invoiceService, promoService }) {
  return {
    overview: asyncHandler(async (req, res) => {
      res.json(await accountService.getOverview(req.user));
    }),

    updateProfile: asyncHandler(async (req, res) => {
      res.json(await accountService.updateProfile(req.user, req.body));
    }),

    addAddress: asyncHandler(async (req, res) => {
      res.status(201).json({ items: await accountService.addAddress(req.user, req.body) });
    }),

    removeAddress: asyncHandler(async (req, res) => {
      res.json({ items: await accountService.removeAddress(req.user, req.params.addressId) });
    }),

    listMembers: asyncHandler(async (req, res) => {
      res.json({ items: await accountService.listMembers(req.user) });
    }),

    inviteMember: asyncHandler(async (req, res) => {
      res.status(201).json(await accountService.inviteMember(req.user, req.body));
    }),

    disableMember: asyncHandler(async (req, res) => {
      res.json(await accountService.disableMember(req.user, req.params.userId));
    }),

    listInvoices: asyncHandler(async (req, res) => {
      res.json(await invoiceService.list(req.user, req.validatedQuery));
    }),

    getInvoice: asyncHandler(async (req, res) => {
      res.json(await invoiceService.get(req.user, req.params.invoiceNumber));
    }),

    listPromos: asyncHandler(async (req, res) => {
      res.json(await promoService.list(req.validatedQuery));
    }),

    getPromo: asyncHandler(async (req, res) => {
      res.json(await promoService.get(req.params.code));
    }),

    upsertPromo: asyncHandler(async (req, res) => {
      res.json(await promoService.upsert(req.body));
    }),

    deactivatePromo: asyncHandler(async (req, res) => {
      res.json(await promoService.deactivate(req.params.code));
    }),
  };
}

module.exports = { createAccountController };
```

## apps/ecom-gokinetic/server/src/controllers/authController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/authController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/**
 * Thin HTTP adapters over authService/accountService. The refresh token is
 * returned in the body (the SPA keeps it in memory + sessionStorage); the
 * user agent is recorded on the session for the "active sessions" audit.
 */
function createAuthController({ authService, accountService }) {
  const agent = (req) => (req.get('User-Agent') || '').slice(0, 200);

  return {
    register: asyncHandler(async (req, res) => {
      const result = await authService.register(req.body, { userAgent: agent(req) });
      res.status(201).json(result);
    }),

    login: asyncHandler(async (req, res) => {
      res.json(await authService.login(req.body, { userAgent: agent(req) }));
    }),

    refresh: asyncHandler(async (req, res) => {
      res.json(await authService.refresh(req.body.refreshToken, { userAgent: agent(req) }));
    }),

    logout: asyncHandler(async (req, res) => {
      await authService.logout(req.body.refreshToken);
      res.status(204).end();
    }),

    me: asyncHandler(async (req, res) => {
      res.json(await accountService.getOverview(req.user));
    }),

    changePassword: asyncHandler(async (req, res) => {
      await authService.changePassword(req.user.id, req.body);
      res.status(204).end();
    }),

    activateInvite: asyncHandler(async (req, res) => {
      res.json(await accountService.activateInvite(req.body));
    }),
  };
}

module.exports = { createAuthController };
```

## apps/ecom-gokinetic/server/src/controllers/cartController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/cartController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Guest carts are authorised by an opaque token sent in this header. */
const CART_TOKEN_HEADER = 'X-Cart-Token';

function createCartController({ cartService }) {
  const token = (req) => req.get(CART_TOKEN_HEADER) || null;

  /** Runs a cart mutation with the caller's identity and returns the view. */
  const mutate = (operation) =>
    asyncHandler(async (req, res) => {
      res.json(await operation(req, req.user || null, token(req)));
    });

  return {
    create: asyncHandler(async (req, res) => {
      const { cart, guestToken } = await cartService.create(req.body, req.user || null);
      if (guestToken) res.set(CART_TOKEN_HEADER, guestToken);
      res
        .status(201)
        .location(`/api/v1/carts/${cart.id}`)
        .json({ ...cart, ...(guestToken ? { guestToken } : {}) });
    }),

    get: mutate((req, principal, guestToken) => cartService.get(req.params.cartId, principal, guestToken)),

    addItem: mutate((req, principal, guestToken) =>
      cartService.addItem(req.params.cartId, req.body, principal, guestToken),
    ),

    updateItem: mutate((req, principal, guestToken) =>
      cartService.updateItem(req.params.cartId, req.params.sku, req.body, principal, guestToken),
    ),

    removeItem: mutate((req, principal, guestToken) =>
      cartService.updateItem(req.params.cartId, req.params.sku, { quantity: 0 }, principal, guestToken),
    ),

    setTerm: mutate((req, principal, guestToken) =>
      cartService.setContractTerm(req.params.cartId, req.body, principal, guestToken),
    ),

    setAddress: mutate((req, principal, guestToken) =>
      cartService.setServiceAddress(req.params.cartId, req.body, principal, guestToken),
    ),

    applyPromo: mutate((req, principal, guestToken) =>
      cartService.applyPromo(req.params.cartId, req.body, principal, guestToken),
    ),

    removePromo: mutate((req, principal, guestToken) => cartService.removePromo(req.params.cartId, principal, guestToken)),

    claim: asyncHandler(async (req, res) => {
      res.json(await cartService.claim(req.params.cartId, token(req), req.user));
    }),
  };
}

module.exports = { createCartController, CART_TOKEN_HEADER };
```

## apps/ecom-gokinetic/server/src/controllers/catalogController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/catalogController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

const CATALOG_CACHE_SECONDS = 60;

function createCatalogController({ catalogService, serviceability, installScheduling }) {
  return {
    list: asyncHandler(async (req, res) => {
      const { serviceabilityCheckId, ...query } = req.validatedQuery;
      const page = await catalogService.list(query, { serviceabilityCheckId });
      // Address-filtered listings are personal; generic ones can be cached by the CDN.
      res.set('Cache-Control', serviceabilityCheckId ? 'private, no-store' : `public, max-age=${CATALOG_CACHE_SECONDS}`);
      res.json(page);
    }),

    compare: asyncHandler(async (req, res) => {
      const skus = [...new Set(req.validatedQuery.skus.split(',').map((s) => s.trim()))];
      res.json({ items: await catalogService.compare(skus) });
    }),

    detail: asyncHandler(async (req, res) => {
      res.set('Cache-Control', `public, max-age=${CATALOG_CACHE_SECONDS}`);
      res.json(await catalogService.getWithBundleOptions(req.params.sku, req.validatedQuery.segment));
    }),

    upsert: asyncHandler(async (req, res) => {
      res.json(await catalogService.upsert(req.body));
    }),

    deactivate: asyncHandler(async (req, res) => {
      res.json(await catalogService.deactivate(req.params.sku));
    }),

    checkAddress: asyncHandler(async (req, res) => {
      const result = await serviceability.check(req.body.address, { segment: req.body.segment });
      res.status(201).location(`/api/v1/serviceability/checks/${result.checkId}`).json(result);
    }),

    getCheck: asyncHandler(async (req, res) => {
      res.json(await serviceability.getCheck(req.params.checkId, { segment: req.user ? req.user.segment : undefined }));
    }),

    installSlots: asyncHandler(async (req, res) => {
      res.json(
        await installScheduling.listSlots(req.params.checkId, {
          days: req.validatedQuery.days,
          segment: req.user ? req.user.segment : undefined,
        }),
      );
    }),
  };
}

module.exports = { createCatalogController };
```

## apps/ecom-gokinetic/server/src/controllers/orderController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/orderController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');
const { ORDER_STATUS } = require('../domain/constants');

const EXIT_STATUSES = new Set([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED]);

/**
 * Checkout and order endpoints. Placing an order first vets the preferred
 * installation date against the cart's serviceability check, then hands the
 * cart to the checkout saga.
 */
function createOrderController({ cartService, checkoutService, orderService, invoiceService, installScheduling }) {
  return {
    placeOrder: asyncHandler(async (req, res) => {
      const cart = await cartService.loadForCheckout(req.body.cartId, req.user);
      if (cart.serviceability && cart.serviceability.checkId) {
        await installScheduling.assertPreferredDate(cart.serviceability.checkId, req.body.preferredInstallDate);
      }
      const order = await checkoutService.placeOrder(req.user, req.body);
      res.status(201).location(`/api/v1/orders/${order.orderNumber}`).json(order);
    }),

    list: asyncHandler(async (req, res) => {
      res.json(await orderService.list(req.user, req.validatedQuery));
    }),

    get: asyncHandler(async (req, res) => {
      res.json(await orderService.get(req.user, req.params.orderNumber));
    }),

    track: asyncHandler(async (req, res) => {
      res.json(await orderService.track(req.user, req.params.orderNumber));
    }),

    cancel: asyncHandler(async (req, res) => {
      const order = await orderService.cancel(req.user, req.params.orderNumber, req.body);
      await invoiceService.voidForOrder(order.orderNumber);
      res.json(order);
    }),

    advance: asyncHandler(async (req, res) => {
      const order = await orderService.advance(req.user, req.params.orderNumber, req.body);
      if (EXIT_STATUSES.has(order.status)) await invoiceService.voidForOrder(order.orderNumber);
      res.json(order);
    }),
  };
}

module.exports = { createOrderController };
```

## apps/ecom-gokinetic/server/src/controllers/quoteController.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/controllers/quoteController.js`.

```javascript
'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Business GoKinetic multi-site quotes and bulk order conversion. */
function createQuoteController({ quoteService }) {
  const number = (req) => req.params.quoteNumber;

  return {
    request: asyncHandler(async (req, res) => {
      const quote = await quoteService.request(req.user, req.body);
      res.status(201).location(`/api/v1/quotes/${quote.quoteNumber}`).json(quote);
    }),

    list: asyncHandler(async (req, res) => {
      res.json(await quoteService.list(req.user, req.validatedQuery));
    }),

    get: asyncHandler(async (req, res) => {
      res.json(await quoteService.get(req.user, number(req)));
    }),

    price: asyncHandler(async (req, res) => {
      res.json(await quoteService.price(req.user, number(req), req.body));
    }),

    send: asyncHandler(async (req, res) => {
      res.json(await quoteService.send(req.user, number(req)));
    }),

    approve: asyncHandler(async (req, res) => {
      res.json(await quoteService.approve(req.user, number(req)));
    }),

    reject: asyncHandler(async (req, res) => {
      res.json(await quoteService.reject(req.user, number(req), req.body));
    }),

    accept: asyncHandler(async (req, res) => {
      res.json(await quoteService.accept(req.user, number(req), req.body));
    }),

    convert: asyncHandler(async (req, res) => {
      const result = await quoteService.convert(req.user, number(req), req.body);
      res.status(201).json(result);
    }),
  };
}

module.exports = { createQuoteController };
```

## apps/ecom-gokinetic/server/src/domain/address.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/address.js`.

```javascript
'use strict';

const crypto = require('node:crypto');

/**
 * US postal address normalisation used for serviceability lookups and cache
 * keys. The upstream serviceability API is sensitive to abbreviations, so the
 * storefront normalises before calling it and before caching results.
 */

const STREET_SUFFIXES = Object.freeze({
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  CIRCLE: 'CIR',
  COURT: 'CT',
  DRIVE: 'DR',
  HIGHWAY: 'HWY',
  LANE: 'LN',
  PARKWAY: 'PKWY',
  PLACE: 'PL',
  ROAD: 'RD',
  STREET: 'ST',
  TERRACE: 'TER',
  TRAIL: 'TRL',
});

const DIRECTIONALS = Object.freeze({
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
});

const UNIT_DESIGNATORS = Object.freeze({
  APARTMENT: 'APT',
  SUITE: 'STE',
  UNIT: 'UNIT',
  BUILDING: 'BLDG',
  FLOOR: 'FL',
});

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]);

function normaliseToken(token) {
  const upper = token.toUpperCase().replace(/[.,#]/g, '');
  return STREET_SUFFIXES[upper] || DIRECTIONALS[upper] || UNIT_DESIGNATORS[upper] || upper;
}

function normaliseLine(line) {
  if (!line) return '';
  return line
    .trim()
    .split(/\s+/)
    .map(normaliseToken)
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {{line1: string, line2?: string, city: string, state: string, postalCode: string}} address
 * @returns {{line1: string, line2: string, city: string, state: string, postalCode: string}}
 */
function normalizeAddress(address) {
  const postal = String(address.postalCode || '').trim();
  return {
    line1: normaliseLine(address.line1),
    line2: normaliseLine(address.line2),
    city: String(address.city || '').trim().toUpperCase().replace(/\s+/g, ' '),
    state: String(address.state || '').trim().toUpperCase(),
    postalCode: postal.slice(0, 5),
  };
}

/**
 * Validates a raw address; returns field errors in the shared format.
 */
function validateAddress(address, prefix = 'address') {
  const errors = [];
  if (!address || typeof address !== 'object') {
    return [{ path: prefix, message: 'Address is required.' }];
  }
  if (!address.line1 || String(address.line1).trim().length < 3) {
    errors.push({ path: `${prefix}.line1`, message: 'Street address is required.' });
  }
  if (!address.city || String(address.city).trim().length < 2) {
    errors.push({ path: `${prefix}.city`, message: 'City is required.' });
  }
  if (!US_STATES.has(String(address.state || '').toUpperCase())) {
    errors.push({ path: `${prefix}.state`, message: 'State must be a valid two-letter US state code.' });
  }
  if (!/^\d{5}(-\d{4})?$/.test(String(address.postalCode || '').trim())) {
    errors.push({ path: `${prefix}.postalCode`, message: 'ZIP code must be 5 digits or ZIP+4.' });
  }
  return errors;
}

/** Stable hash of the normalised address, used as a cache key. */
function addressKey(address) {
  const n = normalizeAddress(address);
  const canonical = [n.line1, n.line2, n.city, n.state, n.postalCode].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Single-line rendering for emails and the order summary. */
function formatAddress(address) {
  const parts = [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`];
  return parts.filter(Boolean).join(', ');
}

module.exports = { normalizeAddress, validateAddress, addressKey, formatAddress, US_STATES };
```

## apps/ecom-gokinetic/server/src/domain/billing.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/billing.js`.

```javascript
'use strict';

const { divideRoundHalfEven, allocate } = require('./money');
const { randomCode } = require('./identifiers');

/**
 * Invoice construction for storefront orders.
 *
 * Two kinds of invoice are produced:
 *  - INITIAL:   the one-off charges taken at checkout (hardware, installation,
 *               one-time promo discounts and their tax). Amounts come straight
 *               from the order's pricing snapshot so the invoice always equals
 *               what was authorised.
 *  - RECURRING: calendar-month service charges. Billing runs on the 1st of each
 *               month; the first period is prorated from the activation date.
 *               Introductory free months (FREE_MONTHS promos) are credited in
 *               full on the first N periods.
 *
 * Pure functions only; amounts are integer minor units.
 */

const INVOICE_KINDS = Object.freeze({ INITIAL: 'INITIAL', RECURRING: 'RECURRING' });
const INVOICE_STATUS = Object.freeze({ ISSUED: 'ISSUED', PAID: 'PAID', VOID: 'VOID' });

const DAY_MS = 24 * 3600 * 1000;

/** @returns {string} e.g. INV-202611-7HQ2XK */
function generateInvoiceNumber(date) {
  const yyyymm = date.toISOString().slice(0, 7).replace('-', '');
  return `INV-${yyyymm}-${randomCode(6)}`;
}

function monthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function daysBetween(start, end) {
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Number of whole calendar months between the activation month and the
 * month containing `asOf` (0 for the activation month itself).
 */
function periodIndex(activatedAt, asOf) {
  return (
    (asOf.getUTCFullYear() - activatedAt.getUTCFullYear()) * 12 +
    (asOf.getUTCMonth() - activatedAt.getUTCMonth())
  );
}

/**
 * The billing period containing `asOf` for a service activated at
 * `activatedAt`. The first period starts on the activation day.
 * @returns {{start: Date, end: Date, index: number, billedDays: number, daysInPeriod: number}}
 *   `end` is exclusive.
 */
function billingPeriod(activatedAt, asOf) {
  const activation = startOfUtcDay(activatedAt);
  const index = periodIndex(activation, asOf);
  if (index < 0) throw new RangeError('asOf is before the activation date');
  const fullStart = monthStart(asOf);
  const end = nextMonthStart(asOf);
  const start = index === 0 ? activation : fullStart;
  return {
    start,
    end,
    index,
    billedDays: daysBetween(start, end),
    daysInPeriod: daysBetween(fullStart, end),
  };
}

/** Prorates a monthly amount for a partial period, rounding half-even. */
function prorate(amount, billedDays, daysInPeriod) {
  if (billedDays >= daysInPeriod) return amount;
  return divideRoundHalfEven(amount * billedDays, daysInPeriod);
}

function nameBySku(order) {
  return new Map((order.items || []).map((i) => [i.sku, i.name]));
}

function totals(lines, tax) {
  const subtotal = lines.reduce((acc, l) => acc + l.amount, 0);
  return { subtotal, tax, total: subtotal + tax };
}

/**
 * Builds the INITIAL invoice body (without number/status) from an order.
 * Returns null when nothing was due at checkout.
 */
function buildInitialInvoice(order) {
  const oneTime = order.pricing && order.pricing.oneTime;
  if (!oneTime || order.dueToday <= 0) return null;
  const lines = [];
  if (oneTime.hardware > 0) lines.push({ description: 'Equipment', amount: oneTime.hardware });
  if (oneTime.installation > 0) lines.push({ description: 'Installation', amount: oneTime.installation });
  if (oneTime.installationWaived > 0) {
    lines.push({ description: 'Installation waived (contract term)', amount: -oneTime.installationWaived });
  }
  if (oneTime.promoDiscount > 0) {
    lines.push({ description: `Promotion ${order.promoCode || ''}`.trim(), amount: -oneTime.promoDiscount });
  }
  return {
    kind: INVOICE_KINDS.INITIAL,
    accountId: order.accountId,
    orderNumber: order.orderNumber,
    currency: order.currency || 'USD',
    periodStart: null,
    periodEnd: null,
    lines,
    ...totals(lines, oneTime.tax),
  };
}

/**
 * Builds a RECURRING invoice body for the period containing `asOf`.
 * @param {object} order ACTIVE order with pricing snapshot and activatedAt
 * @param {Date} asOf
 */
function buildRecurringInvoice(order, asOf) {
  if (!order.activatedAt) throw new RangeError(`Order ${order.orderNumber} has no activation date`);
  const pricing = order.pricing;
  const period = billingPeriod(new Date(order.activatedAt), asOf);
  const names = nameBySku(order);

  const recurringLines = pricing.lines.filter((l) => l.monthlyNet > 0);
  const fullAmounts = recurringLines.map((l) => l.monthlyNet);
  const fullSubtotal = fullAmounts.reduce((a, b) => a + b, 0);
  // Prorate the subtotal once and spread it, so lines always add up exactly.
  const proratedSubtotal = prorate(fullSubtotal, period.billedDays, period.daysInPeriod);
  const lineAmounts = allocate(proratedSubtotal, fullAmounts);
  const lines = recurringLines.map((l, i) => ({
    sku: l.sku,
    description: `${names.get(l.sku) || l.sku}${l.quantity > 1 ? ` x${l.quantity}` : ''}`,
    amount: lineAmounts[i],
  }));
  let tax = prorate(pricing.recurring.tax, period.billedDays, period.daysInPeriod);

  const freeMonths = (pricing.introductory && pricing.introductory.freeMonths) || 0;
  if (period.index < freeMonths && proratedSubtotal > 0) {
    lines.push({
      description: `Introductory offer - month ${period.index + 1} of ${freeMonths} free`,
      amount: -proratedSubtotal,
    });
    tax = 0;
  }

  return {
    kind: INVOICE_KINDS.RECURRING,
    accountId: order.accountId,
    orderNumber: order.orderNumber,
    currency: order.currency || 'USD',
    periodStart: period.start,
    periodEnd: period.end,
    prorated: period.billedDays < period.daysInPeriod,
    lines,
    ...totals(lines, tax),
  };
}

/**
 * Payment due date: business accounts on credit terms get their terms,
 * everyone else the consumer default.
 */
function dueDate(issuedAt, { creditTermsDays = 0, consumerDueDays = 14 } = {}) {
  const days = creditTermsDays > 0 ? creditTermsDays : consumerDueDays;
  return new Date(startOfUtcDay(issuedAt).getTime() + days * DAY_MS);
}

/** Derived status shown to customers: an unpaid invoice past due is OVERDUE. */
function displayStatus(invoice, now) {
  if (invoice.status === INVOICE_STATUS.ISSUED && invoice.dueAt && new Date(invoice.dueAt) < now) {
    return 'OVERDUE';
  }
  return invoice.status;
}

module.exports = {
  INVOICE_KINDS,
  INVOICE_STATUS,
  generateInvoiceNumber,
  billingPeriod,
  prorate,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
};
```

## apps/ecom-gokinetic/server/src/domain/billing.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/billing.test.js`.

```javascript
'use strict';

const {
  billingPeriod,
  prorate,
  buildInitialInvoice,
  buildRecurringInvoice,
  dueDate,
  displayStatus,
  generateInvoiceNumber,
} = require('./billing');

const activeOrder = (overrides = {}) => ({
  orderNumber: 'GK-20260310-ABCDEF',
  accountId: 'ACC-00000001',
  currency: 'USD',
  activatedAt: new Date('2026-03-15T16:30:00Z'),
  items: [{ sku: 'GK-FIBRE-1000', name: 'Fibre 1 Gig', quantity: 1 }],
  pricing: {
    lines: [{ sku: 'GK-FIBRE-1000', quantity: 1, monthlyNet: 7600 }],
    recurring: { tax: 475 },
    introductory: { freeMonths: 0, monthlyCredit: 0 },
  },
  ...overrides,
});

describe('billingPeriod', () => {
  test('first period runs from the activation day to the next month start', () => {
    const p = billingPeriod(new Date('2026-03-15T16:30:00Z'), new Date('2026-03-20T00:00:00Z'));
    expect(p.start.toISOString()).toBe('2026-03-15T00:00:00.000Z');
    expect(p.end.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(p).toMatchObject({ index: 0, billedDays: 17, daysInPeriod: 31 });
  });

  test('later periods are full calendar months', () => {
    const p = billingPeriod(new Date('2026-03-15T00:00:00Z'), new Date('2026-05-02T00:00:00Z'));
    expect(p).toMatchObject({ index: 2, billedDays: 31, daysInPeriod: 31 });
  });

  test('refuses dates before activation', () => {
    expect(() => billingPeriod(new Date('2026-03-15T00:00:00Z'), new Date('2026-02-01T00:00:00Z'))).toThrow(RangeError);
  });
});

test('prorate returns the full amount for a full period', () => {
  expect(prorate(7600, 31, 31)).toBe(7600);
  expect(prorate(7600, 17, 31)).toBe(4168);
});

describe('buildRecurringInvoice', () => {
  test('prorates the first period, lines and tax', () => {
    const invoice = buildRecurringInvoice(activeOrder(), new Date('2026-03-20T00:00:00Z'));
    expect(invoice.prorated).toBe(true);
    expect(invoice.lines).toEqual([{ sku: 'GK-FIBRE-1000', description: 'Fibre 1 Gig', amount: 4168 }]);
    expect(invoice).toMatchObject({ subtotal: 4168, tax: 260, total: 4428 });
  });

  test('bills a full month after the first period', () => {
    const invoice = buildRecurringInvoice(activeOrder(), new Date('2026-04-02T00:00:00Z'));
    expect(invoice).toMatchObject({ prorated: false, subtotal: 7600, tax: 475, total: 8075 });
  });

  test('credits introductory free months in full', () => {
    const order = activeOrder();
    order.pricing.introductory.freeMonths = 2;
    const second = buildRecurringInvoice(order, new Date('2026-04-02T00:00:00Z'));
    expect(second.total).toBe(0);
    expect(second.lines[1].description).toMatch(/month 2 of 2 free/);
    const third = buildRecurringInvoice(order, new Date('2026-05-02T00:00:00Z'));
    expect(third.total).toBe(8075);
  });

  test('requires an activation date', () => {
    expect(() => buildRecurringInvoice(activeOrder({ activatedAt: null }), new Date())).toThrow(RangeError);
  });
});

describe('buildInitialInvoice', () => {
  test('returns null when nothing was due at checkout', () => {
    expect(buildInitialInvoice({ ...activeOrder(), dueToday: 0, pricing: { oneTime: {} } })).toBeNull();
  });

  test('itemises equipment, installation and its waiver', () => {
    const invoice = buildInitialInvoice({
      ...activeOrder(),
      dueToday: 13706,
      pricing: { oneTime: { hardware: 12900, installation: 9900, installationWaived: 9900, promoDiscount: 0, tax: 806 } },
    });
    expect(invoice.lines.map((l) => l.amount)).toEqual([12900, 9900, -9900]);
    expect(invoice).toMatchObject({ kind: 'INITIAL', subtotal: 12900, tax: 806, total: 13706 });
  });
});

test('dueDate honours business credit terms', () => {
  const issued = new Date('2026-03-20T10:00:00Z');
  expect(dueDate(issued).toISOString()).toBe('2026-04-03T00:00:00.000Z');
  expect(dueDate(issued, { creditTermsDays: 30 }).toISOString()).toBe('2026-04-19T00:00:00.000Z');
});

test('displayStatus flags unpaid invoices past their due date', () => {
  const now = new Date('2026-05-01T00:00:00Z');
  expect(displayStatus({ status: 'ISSUED', dueAt: '2026-04-03T00:00:00Z' }, now)).toBe('OVERDUE');
  expect(displayStatus({ status: 'PAID', dueAt: '2026-04-03T00:00:00Z' }, now)).toBe('PAID');
});

test('invoice numbers embed the issue month', () => {
  expect(generateInvoiceNumber(new Date('2026-11-11T00:00:00Z'))).toMatch(/^INV-202611-[A-Z0-9]{6}$/);
});
```

## apps/ecom-gokinetic/server/src/domain/constants.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/constants.js`.

```javascript
'use strict';

/** Roles from the platform-wide domain vocabulary (CONVENTIONS.md). */
const ROLES = Object.freeze({
  CONSUMER: 'CONSUMER',
  BUSINESS_ADMIN: 'BUSINESS_ADMIN',
  BUSINESS_USER: 'BUSINESS_USER',
  PARTNER_ADMIN: 'PARTNER_ADMIN',
  PARTNER_AGENT: 'PARTNER_AGENT',
  WHOLESALE_BUYER: 'WHOLESALE_BUYER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
});

const BUSINESS_ROLES = Object.freeze([ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER]);
const STAFF_ROLES = Object.freeze([ROLES.SUPPORT_AGENT]);

/** Storefront brands served by this app. */
const SEGMENTS = Object.freeze({
  CONSUMER: 'CONSUMER',
  BUSINESS: 'BUSINESS',
});

const PRODUCT_TYPES = Object.freeze({
  PLAN: 'PLAN',
  ADDON: 'ADDON',
  HARDWARE: 'HARDWARE',
});

const ORDER_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  VALIDATED: 'VALIDATED',
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  NOT_REQUIRED: 'NOT_REQUIRED',
});

const QUOTE_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  PRICED: 'PRICED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CONVERTED: 'CONVERTED',
});

const PROMO_KINDS = Object.freeze({
  PERCENT_OFF: 'PERCENT_OFF',
  FIXED_OFF: 'FIXED_OFF',
  FREE_INSTALLATION: 'FREE_INSTALLATION',
  FREE_MONTHS: 'FREE_MONTHS',
});

const PROMO_SCOPES = Object.freeze({
  RECURRING: 'RECURRING',
  ONE_TIME: 'ONE_TIME',
  ALL: 'ALL',
});

/** Contract terms offered and the recurring discount (in bps) each earns. */
const CONTRACT_TERMS = Object.freeze({
  0: { discountBps: 0, waivesInstallation: false },
  12: { discountBps: 0, waivesInstallation: true },
  24: { discountBps: 500, waivesInstallation: true },
  36: { discountBps: 1000, waivesInstallation: true },
});

/**
 * Sales tax rates by US state, basis points. Telecom taxes are far more nuanced
 * in practice; this table drives the storefront estimate shown before checkout.
 */
const STATE_TAX_BPS = Object.freeze({
  AL: 400,
  AR: 650,
  GA: 400,
  IA: 600,
  KY: 600,
  MN: 688,
  MS: 700,
  NC: 475,
  NE: 550,
  NM: 513,
  NY: 400,
  OH: 575,
  PA: 600,
  SC: 600,
  TX: 625,
});

const DEFAULT_TAX_BPS = 0;

module.exports = {
  ROLES,
  BUSINESS_ROLES,
  STAFF_ROLES,
  SEGMENTS,
  PRODUCT_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  QUOTE_STATUS,
  PROMO_KINDS,
  PROMO_SCOPES,
  CONTRACT_TERMS,
  STATE_TAX_BPS,
  DEFAULT_TAX_BPS,
};
```

## apps/ecom-gokinetic/server/src/domain/identifiers.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/identifiers.js`.

```javascript
'use strict';

const crypto = require('node:crypto');

/**
 * Human-facing identifiers. Account ids follow the platform format
 * `ACC-########`; order and quote numbers embed the UTC date so support agents
 * can triage them at a glance.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I to avoid misreads

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function datePart(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** @returns {string} e.g. ACC-04821937 */
function formatAccountId(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 99999999) {
    throw new RangeError('Account sequence out of range');
  }
  return `ACC-${String(sequence).padStart(8, '0')}`;
}

function isAccountId(value) {
  return /^ACC-\d{8}$/.test(String(value));
}

/** @returns {string} e.g. GK-20261111-7HQ2XK */
function generateOrderNumber(date) {
  return `GK-${datePart(date)}-${randomCode(6)}`;
}

/** @returns {string} e.g. QTE-20261111-K3M9 */
function generateQuoteNumber(date) {
  return `QTE-${datePart(date)}-${randomCode(4)}`;
}

function generateCorrelationId() {
  return crypto.randomUUID();
}

module.exports = {
  formatAccountId,
  isAccountId,
  generateOrderNumber,
  generateQuoteNumber,
  generateCorrelationId,
  randomCode,
};
```

## apps/ecom-gokinetic/server/src/domain/installWindows.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/installWindows.js`.

```javascript
'use strict';

/**
 * Installation appointment windows offered at checkout.
 *
 * The storefront only captures a *preferred* date; the field-force system
 * books the real appointment once the order is validated (see
 * orderService.processSubmitted). These rules keep the preference realistic:
 *
 *  - the earliest date is the network lead time for the address (from the
 *    serviceability check) counted in install days, plus extra days when a
 *    site survey is required
 *  - engineers do not work Sundays or US federal holidays
 *  - Saturdays only offer a morning window
 *  - preferences more than MAX_HORIZON_DAYS out are refused (capacity plans
 *    are not published that far ahead)
 *
 * All calculations are on UTC calendar dates.
 */

const DEFAULT_LEAD_DAYS = 5;
const MIN_LEAD_DAYS = 2;
const SITE_SURVEY_EXTRA_DAYS = 5;
const MAX_HORIZON_DAYS = 60;
const DAY_MS = 24 * 3600 * 1000;

const WINDOWS = Object.freeze({
  AM: { id: 'AM', label: '8am - 12pm', startHourUtc: 13 },
  PM: { id: 'PM', label: '12pm - 5pm', startHourUtc: 17 },
});

function startOfUtcDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

/** nth weekday (0=Sun) of a month, e.g. 4th Thursday of November. */
function nthWeekday(year, month, weekday, n) {
  const first = new Date(Date.UTC(year, month, 1));
  const offset = (weekday - first.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(year, month, 1 + offset + (n - 1) * 7));
}

/** Last given weekday of a month, e.g. last Monday of May. */
function lastWeekday(year, month, weekday) {
  const last = new Date(Date.UTC(year, month + 1, 0));
  const offset = (last.getUTCDay() - weekday + 7) % 7;
  return new Date(Date.UTC(year, month, last.getUTCDate() - offset));
}

/**
 * Fixed-date holidays falling on a weekend are observed on the nearest
 * weekday (Saturday -> Friday, Sunday -> Monday).
 */
function observed(date) {
  const day = date.getUTCDay();
  if (day === 6) return addDays(date, -1);
  if (day === 0) return addDays(date, 1);
  return date;
}

const holidayCache = new Map();

/** US federal holidays for a year as a Set of YYYY-MM-DD strings. */
function federalHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const dates = [
    observed(new Date(Date.UTC(year, 0, 1))), // New Year's Day
    nthWeekday(year, 0, 1, 3), // MLK Day
    nthWeekday(year, 1, 1, 3), // Presidents' Day
    lastWeekday(year, 4, 1), // Memorial Day
    observed(new Date(Date.UTC(year, 5, 19))), // Juneteenth
    observed(new Date(Date.UTC(year, 6, 4))), // Independence Day
    nthWeekday(year, 8, 1, 1), // Labor Day
    nthWeekday(year, 9, 1, 2), // Columbus Day
    observed(new Date(Date.UTC(year, 10, 11))), // Veterans Day
    nthWeekday(year, 10, 4, 4), // Thanksgiving
    observed(new Date(Date.UTC(year, 11, 25))), // Christmas
  ];
  const set = new Set(dates.map(toDateString));
  holidayCache.set(year, set);
  return set;
}

function isInstallDay(date) {
  if (date.getUTCDay() === 0) return false;
  return !federalHolidays(date.getUTCFullYear()).has(toDateString(date));
}

function windowsFor(date) {
  return date.getUTCDay() === 6 ? [WINDOWS.AM] : [WINDOWS.AM, WINDOWS.PM];
}

/**
 * Advances `count` install days from `from` (exclusive).
 */
function addInstallDays(from, count) {
  let cursor = startOfUtcDay(from);
  let remaining = count;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (isInstallDay(cursor)) remaining -= 1;
  }
  return cursor;
}

/**
 * @param {{estimatedInstallDays?: number|null, requiresSiteSurvey?: boolean}} check
 * @param {Date} now
 * @returns {Date} earliest bookable install date (UTC midnight)
 */
function earliestInstallDate(check, now) {
  const lead = Math.max(MIN_LEAD_DAYS, check.estimatedInstallDays ?? DEFAULT_LEAD_DAYS);
  const extra = check.requiresSiteSurvey ? SITE_SURVEY_EXTRA_DAYS : 0;
  return addInstallDays(now, lead + extra);
}

/**
 * Lists the next `days` install days with their windows.
 * @returns {Array<{date: string, windows: Array<{id: string, label: string, startsAt: string}>}>}
 */
function listInstallSlots(check, now, days = 14) {
  if (!check.serviceable) return [];
  const slots = [];
  const horizon = addDays(startOfUtcDay(now), MAX_HORIZON_DAYS);
  let cursor = earliestInstallDate(check, now);
  while (slots.length < days && cursor <= horizon) {
    if (isInstallDay(cursor)) {
      slots.push({
        date: toDateString(cursor),
        windows: windowsFor(cursor).map((w) => ({
          id: w.id,
          label: w.label,
          startsAt: new Date(cursor.getTime() + w.startHourUtc * 3600000).toISOString(),
        })),
      });
    }
    cursor = addDays(cursor, 1);
  }
  return slots;
}

/**
 * Explains why a preferred date is not acceptable, or returns null.
 * @param {Date} preferred
 */
function preferredDateProblem(check, preferred, now) {
  const day = startOfUtcDay(preferred);
  const earliest = earliestInstallDate(check, now);
  if (day < earliest) {
    return `The earliest available installation date is ${toDateString(earliest)}.`;
  }
  if (day > addDays(startOfUtcDay(now), MAX_HORIZON_DAYS)) {
    return `Installations can be booked at most ${MAX_HORIZON_DAYS} days ahead.`;
  }
  if (!isInstallDay(day)) {
    return 'Installations are not available on Sundays or public holidays.';
  }
  return null;
}

module.exports = {
  WINDOWS,
  MAX_HORIZON_DAYS,
  federalHolidays,
  isInstallDay,
  earliestInstallDate,
  listInstallSlots,
  preferredDateProblem,
};
```

## apps/ecom-gokinetic/server/src/domain/installWindows.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/installWindows.test.js`.

```javascript
'use strict';

const {
  federalHolidays,
  isInstallDay,
  earliestInstallDate,
  listInstallSlots,
  preferredDateProblem,
} = require('./installWindows');

const MONDAY = new Date('2026-11-23T15:00:00Z'); // Thanksgiving week
const day = (iso) => new Date(`${iso}T00:00:00Z`);

describe('federalHolidays', () => {
  test('computes floating holidays and observed dates', () => {
    const h = federalHolidays(2026);
    expect(h.has('2026-11-26')).toBe(true); // Thanksgiving, 4th Thursday
    expect(h.has('2026-07-03')).toBe(true); // July 4th falls on Saturday
    expect(h.has('2026-05-25')).toBe(true); // Memorial Day, last Monday
    expect(h.has('2026-09-07')).toBe(true); // Labor Day
  });
});

test('Sundays and holidays are not install days', () => {
  expect(isInstallDay(day('2026-11-29'))).toBe(false);
  expect(isInstallDay(day('2026-11-26'))).toBe(false);
  expect(isInstallDay(day('2026-11-28'))).toBe(true);
});

describe('earliestInstallDate', () => {
  test('counts lead time in install days, skipping holidays', () => {
    expect(earliestInstallDate({ estimatedInstallDays: 2 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(earliestInstallDate({ estimatedInstallDays: 3 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-27');
  });

  test('enforces the minimum lead and adds survey time', () => {
    expect(earliestInstallDate({ estimatedInstallDays: 0 }, MONDAY).toISOString().slice(0, 10)).toBe('2026-11-25');
    expect(
      earliestInstallDate({ estimatedInstallDays: 2, requiresSiteSurvey: true }, MONDAY).toISOString().slice(0, 10),
    ).toBe('2026-12-02');
  });
});

describe('listInstallSlots', () => {
  test('lists install days with Saturday mornings only', () => {
    const slots = listInstallSlots({ serviceable: true, estimatedInstallDays: 2 }, MONDAY, 4);
    expect(slots.map((s) => s.date)).toEqual(['2026-11-25', '2026-11-27', '2026-11-28', '2026-11-30']);
    expect(slots[0].windows.map((w) => w.id)).toEqual(['AM', 'PM']);
    expect(slots[2].windows.map((w) => w.id)).toEqual(['AM']);
    expect(slots[0].windows[0].startsAt).toBe('2026-11-25T13:00:00.000Z');
  });

  test('offers nothing for unserviceable addresses', () => {
    expect(listInstallSlots({ serviceable: false }, MONDAY)).toEqual([]);
  });
});

describe('preferredDateProblem', () => {
  const check = { serviceable: true, estimatedInstallDays: 2 };
  test.each([
    ['2026-11-24', /earliest available installation date is 2026-11-25/],
    ['2026-11-29', /Sundays or public holidays/],
    ['2027-03-01', /at most 60 days ahead/],
  ])('%s is refused', (iso, message) => {
    expect(preferredDateProblem(check, day(iso), MONDAY)).toMatch(message);
  });

  test('accepts a bookable day', () => {
    expect(preferredDateProblem(check, day('2026-11-27'), MONDAY)).toBeNull();
  });
});
```

## apps/ecom-gokinetic/server/src/domain/money.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/money.js`.

```javascript
'use strict';

/**
 * Integer minor-unit money helpers. Amounts are always integers (cents) paired
 * with an ISO-4217 currency code. Never use floating point for money.
 */

const SUPPORTED_CURRENCIES = new Set(['USD']);

function assertInteger(amount, label = 'amount') {
  if (!Number.isSafeInteger(amount)) {
    throw new TypeError(`${label} must be a safe integer in minor units, got ${amount}`);
  }
}

/**
 * @param {number} amount integer minor units
 * @param {string} currency ISO-4217 code
 * @returns {{amount: number, currency: string}}
 */
function money(amount, currency = 'USD') {
  assertInteger(amount);
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    throw new RangeError(`Unsupported currency ${currency}`);
  }
  return { amount, currency };
}

function zero(currency = 'USD') {
  return money(0, currency);
}

function assertSameCurrency(a, b) {
  if (a.currency !== b.currency) {
    throw new RangeError(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

function add(a, b) {
  assertSameCurrency(a, b);
  return money(a.amount + b.amount, a.currency);
}

function subtract(a, b) {
  assertSameCurrency(a, b);
  return money(a.amount - b.amount, a.currency);
}

function sum(list, currency = 'USD') {
  return list.reduce((acc, item) => add(acc, item), zero(currency));
}

/**
 * Banker's rounding (round half to even) of a rational number num/den.
 * Using integer arithmetic keeps results exact for all safe integers.
 * @param {number} num
 * @param {number} den positive
 */
function divideRoundHalfEven(num, den) {
  if (den <= 0) throw new RangeError('Denominator must be positive');
  const sign = num < 0 ? -1 : 1;
  const absNum = Math.abs(num);
  const quotient = Math.floor(absNum / den);
  const remainder = absNum - quotient * den;
  const twice = remainder * 2;
  let rounded = quotient;
  if (twice > den || (twice === den && quotient % 2 === 1)) rounded += 1;
  return sign * rounded;
}

/**
 * Multiply by an integer quantity.
 */
function multiply(m, quantity) {
  assertInteger(quantity, 'quantity');
  return money(m.amount * quantity, m.currency);
}

/**
 * Applies a rate expressed in basis points (1 bp = 0.01 %), rounding half-even.
 * @param {{amount:number,currency:string}} m
 * @param {number} bps e.g. 825 for 8.25 %
 */
function applyBps(m, bps) {
  assertInteger(bps, 'bps');
  return money(divideRoundHalfEven(m.amount * bps, 10000), m.currency);
}

/**
 * Splits `total` across weights proportionally so the parts always sum to the
 * total exactly (largest remainder method). Used to spread order-level
 * discounts across lines for per-line tax computation.
 * @param {number} total integer minor units
 * @param {number[]} weights non-negative integers
 * @returns {number[]}
 */
function allocate(total, weights) {
  assertInteger(total, 'total');
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (weightSum === 0) {
    const out = weights.map(() => 0);
    out[0] = total;
    return out;
  }
  const raw = weights.map((w) => (total * w) / weightSum);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = total - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, index) => ({ index, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.index - b.index);
  for (let i = 0; remainder > 0; i = (i + 1) % order.length) {
    floors[order[i].index] += 1;
    remainder -= 1;
  }
  return floors;
}

function max(a, b) {
  assertSameCurrency(a, b);
  return a.amount >= b.amount ? a : b;
}

function min(a, b) {
  assertSameCurrency(a, b);
  return a.amount <= b.amount ? a : b;
}

function isZero(m) {
  return m.amount === 0;
}

function isNegative(m) {
  return m.amount < 0;
}

/**
 * Formats for logs/emails only; the API always returns minor units.
 */
function format(m, locale = 'en-US') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency: m.currency }).format(
    m.amount / 100,
  );
}

module.exports = {
  money,
  zero,
  add,
  subtract,
  sum,
  multiply,
  applyBps,
  allocate,
  divideRoundHalfEven,
  max,
  min,
  isZero,
  isNegative,
  format,
  SUPPORTED_CURRENCIES,
};
```

## apps/ecom-gokinetic/server/src/domain/money.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/money.test.js`.

```javascript
'use strict';

const m = require('./money');

describe('money', () => {
  test('rejects non-integer amounts and unsupported currencies', () => {
    expect(() => m.money(10.5)).toThrow(TypeError);
    expect(() => m.money(100, 'EUR')).toThrow(RangeError);
  });

  test('refuses to mix currencies', () => {
    expect(() => m.add({ amount: 1, currency: 'USD' }, { amount: 1, currency: 'GBP' })).toThrow('Currency mismatch');
  });

  test('sum adds a list of amounts', () => {
    expect(m.sum([m.money(150), m.money(250), m.money(-100)])).toEqual({ amount: 300, currency: 'USD' });
  });

  test.each([
    [5, 2, 2], // 2.5 -> 2 (even)
    [7, 2, 4], // 3.5 -> 4 (even)
    [-5, 2, -2],
    [10, 3, 3],
    [20, 3, 7],
  ])('divideRoundHalfEven(%i, %i) = %i', (num, den, expected) => {
    expect(m.divideRoundHalfEven(num, den)).toBe(expected);
  });

  test('applyBps rounds half-even on the exact rational', () => {
    // 1050 * 8.25% = 86.625 -> 87
    expect(m.applyBps(m.money(1050), 825).amount).toBe(87);
    // 200 * 0.25% = 0.5 -> 0 (even)
    expect(m.applyBps(m.money(200), 25).amount).toBe(0);
  });

  test('allocate always sums to the total and favours larger remainders', () => {
    expect(m.allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(m.allocate(10, [0, 0])).toEqual([10, 0]);
    const parts = m.allocate(997, [3, 5, 11, 2]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(997);
  });

  test('format renders dollars for humans only', () => {
    expect(m.format(m.money(123456))).toBe('$1,234.56');
  });
});
```

## apps/ecom-gokinetic/server/src/domain/orderTracking.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/orderTracking.js`.

```javascript
'use strict';

const { ORDER_STATUS } = require('./constants');

/**
 * Builds the customer-facing tracking timeline for an order: the happy-path
 * milestones, which are done, which is current, and an estimated date for
 * the remaining ones.
 */

const MILESTONES = [
  { status: ORDER_STATUS.SUBMITTED, label: 'Order placed', etaDays: 0 },
  { status: ORDER_STATUS.VALIDATED, label: 'Order confirmed', etaDays: 1 },
  { status: ORDER_STATUS.PROVISIONING, label: 'Installation scheduled', etaDays: 2 },
  { status: ORDER_STATUS.ACTIVE, label: 'Service active', etaDays: 10 },
];

const TERMINAL_FAILURES = new Set([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED]);

const DAY_MS = 24 * 3600 * 1000;

function addDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

/**
 * @param {object} order persisted order with statusHistory
 * @param {{estimatedInstallDays?: number|null}} [hints]
 * @returns {{ status: string, steps: Array<object>, closed: boolean, closedReason?: string }}
 */
function buildTimeline(order, hints = {}) {
  const history = order.statusHistory || [];
  const reachedAt = new Map(history.map((h) => [h.to, new Date(h.at)]));
  const submittedAt = reachedAt.get(ORDER_STATUS.SUBMITTED) || (order.submittedAt ? new Date(order.submittedAt) : null);
  const currentIndex = MILESTONES.findIndex((m) => m.status === order.status);

  // Index of the last milestone actually reached (handles CANCELLED/FAILED).
  let lastReached = -1;
  MILESTONES.forEach((m, i) => {
    if (reachedAt.has(m.status)) lastReached = i;
  });

  const installDays = hints.estimatedInstallDays ?? null;
  const steps = MILESTONES.map((milestone, index) => {
    const completedAt = reachedAt.get(milestone.status) || null;
    let state;
    if (completedAt && index < (currentIndex === -1 ? lastReached + 1 : currentIndex)) state = 'COMPLETE';
    else if (index === currentIndex) state = order.status === ORDER_STATUS.ACTIVE ? 'COMPLETE' : 'CURRENT';
    else if (completedAt) state = 'COMPLETE';
    else state = TERMINAL_FAILURES.has(order.status) ? 'SKIPPED' : 'UPCOMING';

    let estimatedAt = null;
    if (state === 'UPCOMING' && submittedAt) {
      if (milestone.status === ORDER_STATUS.ACTIVE && order.installAppointment) {
        estimatedAt = new Date(order.installAppointment);
      } else if (milestone.status === ORDER_STATUS.ACTIVE && installDays != null) {
        estimatedAt = addDays(submittedAt, installDays);
      } else {
        estimatedAt = addDays(submittedAt, milestone.etaDays);
      }
    }
    return {
      status: milestone.status,
      label: milestone.label,
      state,
      completedAt: completedAt ? completedAt.toISOString() : null,
      estimatedAt: estimatedAt ? estimatedAt.toISOString() : null,
    };
  });

  const closed = TERMINAL_FAILURES.has(order.status);
  return {
    status: order.status,
    steps,
    closed,
    ...(closed ? { closedReason: order.cancellationReason || order.failureReason || null } : {}),
    installAppointment: order.installAppointment ? new Date(order.installAppointment).toISOString() : null,
  };
}

/** Whether the customer may still self-cancel. */
function isSelfCancellable(order) {
  return [ORDER_STATUS.DRAFT, ORDER_STATUS.SUBMITTED, ORDER_STATUS.VALIDATED].includes(order.status);
}

module.exports = { buildTimeline, isSelfCancellable, MILESTONES };
```
