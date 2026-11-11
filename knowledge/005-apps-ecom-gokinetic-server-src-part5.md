# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 5 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 31

## Files

- `apps/ecom-gokinetic/server/src/middleware/idempotency.js` (76 lines)
- `apps/ecom-gokinetic/server/src/middleware/paramMatchesBody.js` (21 lines)
- `apps/ecom-gokinetic/server/src/middleware/rateLimit.js` (75 lines)
- `apps/ecom-gokinetic/server/src/middleware/rbac.js` (65 lines)
- `apps/ecom-gokinetic/server/src/middleware/requestLogger.js` (31 lines)
- `apps/ecom-gokinetic/server/src/middleware/validate.js` (35 lines)
- `apps/ecom-gokinetic/server/src/models/Account.js` (32 lines)
- `apps/ecom-gokinetic/server/src/models/Cart.js` (60 lines)
- `apps/ecom-gokinetic/server/src/models/Invoice.js` (50 lines)
- `apps/ecom-gokinetic/server/src/models/Order.js` (77 lines)
- `apps/ecom-gokinetic/server/src/models/Product.js` (42 lines)
- `apps/ecom-gokinetic/server/src/models/PromoCode.js` (52 lines)
- `apps/ecom-gokinetic/server/src/models/Quote.js` (73 lines)
- `apps/ecom-gokinetic/server/src/models/User.js` (29 lines)
- `apps/ecom-gokinetic/server/src/models/shared.js` (52 lines)
- `apps/ecom-gokinetic/server/src/models/support.js` (86 lines)
- `apps/ecom-gokinetic/server/src/repositories/cartRepository.js` (80 lines)
- `apps/ecom-gokinetic/server/src/repositories/identityRepositories.js` (111 lines)
- `apps/ecom-gokinetic/server/src/repositories/infraRepositories.js` (78 lines)
- `apps/ecom-gokinetic/server/src/repositories/invoiceRepository.js` (55 lines)
- `apps/ecom-gokinetic/server/src/repositories/orderRepository.js` (61 lines)
- `apps/ecom-gokinetic/server/src/repositories/pagination.js` (33 lines)
- `apps/ecom-gokinetic/server/src/repositories/productRepository.js` (102 lines)
- `apps/ecom-gokinetic/server/src/repositories/promoRepository.js` (70 lines)
- `apps/ecom-gokinetic/server/src/repositories/quoteRepository.js` (55 lines)
- `apps/ecom-gokinetic/server/src/routes/accountRoutes.js` (48 lines)
- `apps/ecom-gokinetic/server/src/routes/commerceRoutes.js` (101 lines)
- `apps/ecom-gokinetic/server/src/routes/healthRoutes.js` (42 lines)
- `apps/ecom-gokinetic/server/src/routes/index.js` (51 lines)
- `apps/ecom-gokinetic/server/src/routes/publicRoutes.js` (78 lines)
- `apps/ecom-gokinetic/server/src/scripts/seedCatalog.js` (149 lines)

## apps/ecom-gokinetic/server/src/middleware/idempotency.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/idempotency.js`.

```javascript
'use strict';

const crypto = require('node:crypto');
const { ConflictError, ValidationError } = require('../errors');

const HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[A-Za-z0-9-]{16,64}$/;

function fingerprint(req) {
  return crypto
    .createHash('sha256')
    .update(`${req.method}|${req.originalUrl}|${JSON.stringify(req.body || {})}`)
    .digest('hex');
}

/**
 * Makes unsafe POSTs (order placement, quote acceptance) safe to retry.
 *
 * The first request with a key records a `IN_PROGRESS` marker; when it
 * completes the response is stored and replayed for subsequent identical
 * requests. Reusing a key with a different body is a 409, and a concurrent
 * duplicate while the first is still running is also a 409.
 *
 * @param {object} store repository with `begin`, `complete`, `release`
 * @param {{ required?: boolean }} [options]
 */
function idempotency(store, { required = true } = {}) {
  return async (req, res, next) => {
    const key = req.get(HEADER);
    if (!key) {
      if (!required) return next();
      return next(new ValidationError([{ path: `headers.${HEADER}`, message: 'Is required.' }]));
    }
    if (!KEY_PATTERN.test(key)) {
      return next(new ValidationError([{ path: `headers.${HEADER}`, message: 'Must be 16-64 characters.' }]));
    }
    const scope = req.user ? req.user.id : `ip:${req.ip}`;
    const hash = fingerprint(req);

    try {
      const existing = await store.begin({ key, scope, requestHash: hash });
      if (existing) {
        if (existing.requestHash !== hash) {
          return next(new ConflictError('Idempotency-Key was reused with a different request body.'));
        }
        if (existing.state === 'IN_PROGRESS') {
          return next(new ConflictError('A request with this Idempotency-Key is still being processed.'));
        }
        res.set('Idempotent-Replayed', 'true');
        return res.status(existing.responseStatus).json(existing.responseBody);
      }
    } catch (err) {
      return next(err);
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      const status = res.statusCode;
      const persist =
        status < 500
          ? store.complete({ key, scope, responseStatus: status, responseBody: body })
          : store.release({ key, scope });
      Promise.resolve(persist).catch(() => {});
      return originalJson(body);
    };
    res.on('finish', () => {
      if (res.statusCode >= 400 && res.statusCode !== 409) {
        Promise.resolve(store.release({ key, scope })).catch(() => {});
      }
    });
    return next();
  };
}

module.exports = { idempotency, IDEMPOTENCY_HEADER: HEADER, fingerprint };
```

## apps/ecom-gokinetic/server/src/middleware/paramMatchesBody.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/paramMatchesBody.js`.

```javascript
'use strict';

const { ValidationError } = require('../errors');

/**
 * For idempotent PUT-by-key routes (`PUT /products/:sku`): the key in the
 * body must equal the key in the URL, so a client cannot address one
 * resource while writing another. Runs after both are validated.
 * @param {string} field name shared by params and body
 */
function paramMatchesBody(field) {
  return (req, _res, next) => {
    if (req.body[field] !== req.params[field]) {
      return next(new ValidationError([{ path: field, message: `Must match the ${field} in the URL.` }]));
    }
    return next();
  };
}

module.exports = { paramMatchesBody };
```

## apps/ecom-gokinetic/server/src/middleware/rateLimit.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/rateLimit.js`.

```javascript
'use strict';

const { RateLimitError } = require('../errors');

/**
 * Fixed-window in-memory rate limiter.
 *
 * Suitable for a single instance or as a per-pod safety net behind the API
 * gateway's distributed limiter. The store is injectable so a Redis-backed
 * implementation can replace it without touching routes.
 */
function createMemoryStore({ now = () => Date.now() } = {}) {
  const buckets = new Map();
  return {
    /**
     * Increments the counter for `key` in the current window.
     * @returns {{count: number, resetAt: number}}
     */
    hit(key, windowMs) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        bucket = { count: 0, resetAt: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      return { count: bucket.count, resetAt: bucket.resetAt };
    },
    /** Drops expired buckets so memory stays bounded. */
    sweep() {
      const t = now();
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= t) buckets.delete(key);
      }
    },
    size: () => buckets.size,
  };
}

const defaultKey = (req) => (req.user ? `user:${req.user.id}` : `ip:${req.ip}`);

/**
 * @param {object} options
 * @param {number} options.windowMs
 * @param {number} options.max requests per window
 * @param {string} [options.name] bucket namespace (e.g. "auth")
 * @param {(req) => string} [options.keyGenerator]
 * @param {object} [options.store]
 * @param {() => number} [options.now]
 */
function rateLimit({ windowMs, max, name = 'global', keyGenerator = defaultKey, store, now = () => Date.now() }) {
  const backing = store || createMemoryStore({ now });
  const sweepTimer = setInterval(() => backing.sweep(), Math.max(windowMs, 1000));
  if (sweepTimer.unref) sweepTimer.unref();

  const middleware = (req, res, next) => {
    const key = `${name}:${keyGenerator(req)}`;
    const { count, resetAt } = backing.hit(key, windowMs);
    const remaining = Math.max(0, max - count);
    const resetSeconds = Math.max(0, Math.ceil((resetAt - now()) / 1000));
    res.set('RateLimit-Limit', String(max));
    res.set('RateLimit-Remaining', String(remaining));
    res.set('RateLimit-Reset', String(resetSeconds));
    if (count > max) {
      res.set('Retry-After', String(resetSeconds));
      return next(new RateLimitError(resetSeconds));
    }
    return next();
  };
  middleware.stop = () => clearInterval(sweepTimer);
  return middleware;
}

module.exports = { rateLimit, createMemoryStore };
```

## apps/ecom-gokinetic/server/src/middleware/rbac.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/rbac.js`.

```javascript
'use strict';

const { ForbiddenError, UnauthorizedError } = require('../errors');
const { ROLES } = require('../domain/constants');

/**
 * Permission matrix. Routes ask for a permission, never a raw role, so the
 * mapping can evolve without touching controllers.
 */
const PERMISSIONS = Object.freeze({
  'catalog:manage': [ROLES.SUPPORT_AGENT],
  'promo:manage': [ROLES.SUPPORT_AGENT],
  'order:place': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'order:read:own': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'order:read:any': [ROLES.SUPPORT_AGENT],
  'order:cancel:own': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN],
  'order:advance': [ROLES.SUPPORT_AGENT],
  'quote:request': [ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'quote:read:own': [ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
  'quote:accept': [ROLES.BUSINESS_ADMIN],
  'quote:price': [ROLES.SUPPORT_AGENT],
  'quote:approve': [ROLES.SUPPORT_AGENT],
  'quote:read:any': [ROLES.SUPPORT_AGENT],
  'account:manage-users': [ROLES.BUSINESS_ADMIN],
  'account:read': [ROLES.CONSUMER, ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER],
});

/**
 * @param {{roles: string[]}} principal
 * @param {string} permission
 */
function hasPermission(principal, permission) {
  const allowed = PERMISSIONS[permission];
  if (!allowed) throw new Error(`Unknown permission ${permission}`);
  return Boolean(principal && principal.roles.some((role) => allowed.includes(role)));
}

/**
 * Middleware requiring at least one of the given permissions.
 * @param {...string} permissions
 */
function requirePermission(...permissions) {
  permissions.forEach((p) => {
    if (!PERMISSIONS[p]) throw new Error(`Unknown permission ${p}`);
  });
  return (req, _res, next) => {
    if (!req.user) return next(new UnauthorizedError());
    if (permissions.some((p) => hasPermission(req.user, p))) return next();
    return next(new ForbiddenError(`Requires permission: ${permissions.join(' or ')}.`));
  };
}

/**
 * Asserts the principal may access a resource owned by `accountId`: either it
 * belongs to their own account or they hold the `any` permission.
 * @returns {boolean}
 */
function canAccessAccountResource(principal, accountId, anyPermission) {
  if (!principal) return false;
  if (principal.accountId && principal.accountId === accountId) return true;
  return anyPermission ? hasPermission(principal, anyPermission) : false;
}

module.exports = { PERMISSIONS, hasPermission, requirePermission, canAccessAccountResource };
```

## apps/ecom-gokinetic/server/src/middleware/requestLogger.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/requestLogger.js`.

```javascript
'use strict';

const { logger } = require('../config/logger');

/**
 * Logs one structured line per request on completion with latency, status and
 * the authenticated principal (never the token itself).
 */
function requestLogger({ log = logger, ignorePaths = ['/api/v1/health'] } = {}) {
  return (req, res, next) => {
    if (ignorePaths.includes(req.path)) return next();
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
      log[level]('http.request', {
        method: req.method,
        path: req.originalUrl.split('?')[0],
        status: res.statusCode,
        durationMs: Math.round(durationMs * 10) / 10,
        userId: req.user ? req.user.id : undefined,
        accountId: req.user ? req.user.accountId : undefined,
        ip: req.ip,
      });
    });
    return next();
  };
}

module.exports = { requestLogger };
```

## apps/ecom-gokinetic/server/src/middleware/validate.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/validate.js`.

```javascript
'use strict';

const { validate } = require('../validation/validator');
const { ValidationError } = require('../errors');

/**
 * Validates `req[source]` against a schema and replaces it with the coerced
 * value. Query/param errors are prefixed so clients know where to look.
 *
 * @param {Function} schema built with validation/validator
 * @param {'body'|'query'|'params'} [source='body']
 */
function validateRequest(schema, source = 'body') {
  return (req, _res, next) => {
    const input = req[source] === undefined ? {} : req[source];
    const { value, errors } = validate(schema, input);
    if (errors.length > 0) {
      const prefixed =
        source === 'body'
          ? errors
          : errors.map((e) => ({ ...e, path: `${source}.${e.path}` }));
      return next(new ValidationError(prefixed));
    }
    if (source === 'query') {
      // Express 5 makes req.query a getter; store validated values separately.
      req.validatedQuery = value;
    } else {
      req[source] = value;
    }
    return next();
  };
}

module.exports = { validateRequest };
```

## apps/ecom-gokinetic/server/src/models/Account.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Account.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { addressSchema, applyToJSON } = require('./shared');
const { SEGMENTS } = require('../domain/constants');

const savedAddressSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  address: { type: addressSchema, required: true },
  isDefault: { type: Boolean, default: false },
  serviceable: { type: Boolean, default: null },
});

const accountSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, unique: true, match: /^ACC-\d{8}$/ },
    segment: { type: String, enum: Object.values(SEGMENTS), required: true },
    displayName: { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    taxExempt: { type: Boolean, default: false },
    creditTermsDays: { type: Number, default: 0 },
    addresses: { type: [savedAddressSchema], default: [] },
    existingCustomer: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

applyToJSON(accountSchema);

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);
```

## apps/ecom-gokinetic/server/src/models/Cart.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Cart.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, applyToJSON } = require('./shared');
const { SEGMENTS, PRODUCT_TYPES } = require('../domain/constants');

const cartItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, enum: Object.values(PRODUCT_TYPES), required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const serviceabilitySnapshotSchema = new mongoose.Schema(
  {
    checkId: { type: String },
    serviceable: { type: Boolean },
    maxSpeedMbps: { type: Number },
    availablePlanSkus: { type: [String], default: [] },
    checkedAt: { type: Date },
  },
  { _id: false },
);

/**
 * Shopping cart. Guest carts are identified by `guestToken`; once a shopper
 * logs in the cart is claimed by setting `userId`/`accountId`.
 */
const cartSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, default: null },
    accountId: { type: String, index: true, default: null },
    guestToken: { type: String, index: true, default: null },
    segment: { type: String, enum: Object.values(SEGMENTS), default: SEGMENTS.CONSUMER },
    items: { type: [cartItemSchema], default: [] },
    contractTermMonths: { type: Number, default: 12 },
    serviceAddress: { type: addressSchema, default: null },
    serviceability: { type: serviceabilitySnapshotSchema, default: null },
    promoCode: { type: String, default: null },
    status: { type: String, enum: ['OPEN', 'CHECKED_OUT', 'ABANDONED'], default: 'OPEN', index: true },
    reminderSentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

applyToJSON(cartSchema);

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
```

## apps/ecom-gokinetic/server/src/models/Invoice.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Invoice.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { moneyField, applyToJSON } = require('./shared');
const { INVOICE_KINDS, INVOICE_STATUS } = require('../domain/billing');

const invoiceLineSchema = new mongoose.Schema(
  {
    sku: { type: String, default: null },
    description: { type: String, required: true },
    amount: moneyField({ allowNegative: true }),
  },
  { _id: false },
);

/**
 * Customer invoice for an order: one INITIAL invoice for the checkout charges
 * and one RECURRING invoice per calendar month while the service is active.
 */
const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    kind: { type: String, enum: Object.values(INVOICE_KINDS), required: true },
    status: { type: String, enum: Object.values(INVOICE_STATUS), default: INVOICE_STATUS.ISSUED },
    currency: { type: String, default: 'USD' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    prorated: { type: Boolean, default: false },
    lines: { type: [invoiceLineSchema], default: [] },
    subtotal: moneyField({ allowNegative: true }),
    tax: moneyField(),
    total: moneyField({ allowNegative: true }),
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One invoice per order per period (periodStart is null for INITIAL), which
// makes the billing job safe to re-run.
invoiceSchema.index({ orderNumber: 1, kind: 1, periodStart: 1 }, { unique: true });
invoiceSchema.index({ accountId: 1, issuedAt: -1 });

applyToJSON(invoiceSchema);

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
```

## apps/ecom-gokinetic/server/src/models/Order.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Order.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, statusHistorySchema, applyToJSON } = require('./shared');
const { ORDER_STATUS, PAYMENT_STATUS, SEGMENTS, PRODUCT_TYPES } = require('../domain/constants');

const orderItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, enum: Object.values(PRODUCT_TYPES), required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    gatewayReference: { type: String, default: null },
    authorizedAmount: moneyField(),
    capturedAmount: moneyField(),
    refundedAmount: moneyField(),
    last4: { type: String, default: null },
    brand: { type: String, default: null },
    failureCode: { type: String, default: null },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    segment: { type: String, enum: Object.values(SEGMENTS), required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.DRAFT, index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    items: { type: [orderItemSchema], required: true },
    contractTermMonths: { type: Number, required: true },
    serviceAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    contact: {
      email: { type: String, required: true },
      phone: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
    },
    promoCode: { type: String, default: null },
    pricing: { type: mongoose.Schema.Types.Mixed, required: true },
    currency: { type: String, default: 'USD' },
    dueToday: moneyField(),
    monthlyRecurring: moneyField(),
    payment: { type: paymentSchema, default: () => ({}) },
    preferredInstallDate: { type: Date, default: null },
    installAppointment: { type: Date, default: null },
    serviceabilityCheckId: { type: String, default: null },
    sourceQuoteNumber: { type: String, default: null },
    cartId: { type: String, default: null },
    failureReason: { type: String, default: null },
    cancellationReason: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ accountId: 1, createdAt: -1 });
orderSchema.index({ status: 1, updatedAt: 1 });

applyToJSON(orderSchema);

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
```

## apps/ecom-gokinetic/server/src/models/Product.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Product.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { moneyField, applyToJSON } = require('./shared');
const { PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');

/**
 * Catalogue item: a fibre plan, an add-on (e.g. Whole-Home Wi-Fi, static IP,
 * voice line) or hardware (router, mesh extender). Prices are minor units.
 */
const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: Object.values(PRODUCT_TYPES), required: true, index: true },
    segments: { type: [String], enum: Object.values(SEGMENTS), required: true, index: true },
    speedMbps: { type: Number },
    uploadMbps: { type: Number },
    technology: { type: String, enum: ['FTTP', 'FTTC', 'FIXED_WIRELESS'], default: 'FTTP' },
    monthlyPrice: moneyField(),
    oneTimePrice: moneyField(),
    installationFee: moneyField(),
    currency: { type: String, default: 'USD' },
    requiresPlan: { type: Boolean, default: false },
    compatiblePlanSkus: { type: [String], default: [] },
    maxQuantity: { type: Number, default: 1, min: 1 },
    stockOnHand: { type: Number, min: 0 },
    features: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },
  },
  { timestamps: true },
);

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ type: 1, active: 1, monthlyPrice: 1 });

applyToJSON(productSchema);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
```

## apps/ecom-gokinetic/server/src/models/PromoCode.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/PromoCode.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { applyToJSON } = require('./shared');
const { PROMO_KINDS, PROMO_SCOPES, SEGMENTS } = require('../domain/constants');

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    kind: { type: String, enum: Object.values(PROMO_KINDS), required: true },
    scope: { type: String, enum: Object.values(PROMO_SCOPES), default: PROMO_SCOPES.ALL },
    valueBps: { type: Number },
    valueAmount: { type: Number },
    freeMonths: { type: Number },
    maxDiscountAmount: { type: Number },
    durationMonths: { type: Number },
    segments: { type: [String], enum: Object.values(SEGMENTS), default: [] },
    eligibleSkus: { type: [String], default: [] },
    minMonthlySpend: { type: Number },
    minContractTermMonths: { type: Number },
    maxRedemptions: { type: Number },
    redemptionCount: { type: Number, default: 0 },
    perAccountLimit: { type: Number, default: 1 },
    newCustomersOnly: { type: Boolean, default: false },
    startsAt: { type: Date },
    endsAt: { type: Date },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

applyToJSON(promoCodeSchema);

const promoRedemptionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    accountId: { type: String, required: true },
    orderNumber: { type: String, required: true, unique: true },
    discountValue: { type: Number, required: true },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
promoRedemptionSchema.index({ code: 1, accountId: 1 });

const PromoCode = mongoose.models.PromoCode || mongoose.model('PromoCode', promoCodeSchema);
const PromoRedemption =
  mongoose.models.PromoRedemption || mongoose.model('PromoRedemption', promoRedemptionSchema);

module.exports = { PromoCode, PromoRedemption };
```

## apps/ecom-gokinetic/server/src/models/Quote.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/Quote.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, statusHistorySchema, applyToJSON } = require('./shared');
const { QUOTE_STATUS } = require('../domain/constants');

const quoteItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
  },
  { _id: false },
);

const siteSchema = new mongoose.Schema(
  {
    address: { type: addressSchema, required: true },
    serviceable: { type: Boolean, default: null },
    maxSpeedMbps: { type: Number, default: null },
    checkId: { type: String, default: null },
  },
  { _id: false },
);

/** Business GoKinetic multi-site quote. */
const quoteSchema = new mongoose.Schema(
  {
    quoteNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    requestedBy: { type: String, required: true },
    companyName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String },
    items: { type: [quoteItemSchema], required: true },
    sites: { type: [siteSchema], required: true },
    contractTermMonths: { type: Number, required: true },
    negotiatedDiscountBps: { type: Number, default: 0 },
    requiresApproval: { type: Boolean, default: false },
    pricedBy: { type: String, default: null },
    approvedBy: { type: String, default: null },
    pricing: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: Object.values(QUOTE_STATUS), default: QUOTE_STATUS.REQUESTED, index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    validUntil: { type: Date, default: null },
    notes: { type: String },
    internalNotes: { type: [String], default: [] },
    poNumber: { type: String, default: null },
    convertedOrderNumbers: { type: [String], default: [] },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);

quoteSchema.index({ status: 1, validUntil: 1 });

applyToJSON(quoteSchema);
quoteSchema.set('toJSON', {
  ...quoteSchema.get('toJSON'),
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.internalNotes;
    return ret;
  },
});

module.exports = mongoose.models.Quote || mongoose.model('Quote', quoteSchema);
```

## apps/ecom-gokinetic/server/src/models/User.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/User.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { applyToJSON } = require('./shared');
const { ROLES, SEGMENTS } = require('../domain/constants');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    accountId: { type: String, required: true, index: true },
    roles: { type: [String], enum: Object.values(ROLES), default: [ROLES.CONSUMER] },
    segment: { type: String, enum: Object.values(SEGMENTS), default: SEGMENTS.CONSUMER },
    marketingOptIn: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INVITED', 'LOCKED', 'DISABLED'], default: 'ACTIVE' },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyToJSON(userSchema);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
```

## apps/ecom-gokinetic/server/src/models/shared.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/shared.js`.

```javascript
'use strict';

const mongoose = require('mongoose');

/** Sub-schemas reused across collections. */

const moneyField = (opts = {}) => ({
  type: Number,
  required: opts.required !== false,
  default: opts.default ?? 0,
  min: opts.allowNegative ? undefined : 0,
  validate: { validator: Number.isSafeInteger, message: 'Money must be integer minor units.' },
});

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    postalCode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actor: { type: String, default: 'system' },
    reason: { type: String, default: null },
  },
  { _id: false },
);

/** Serialises documents to API shape: `id` instead of `_id`, no `__v`. */
function applyToJSON(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  });
}

module.exports = { moneyField, addressSchema, statusHistorySchema, applyToJSON };
```

## apps/ecom-gokinetic/server/src/models/support.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/models/support.js`.

```javascript
'use strict';

const mongoose = require('mongoose');
const { addressSchema } = require('./shared');

/**
 * Supporting collections that are infrastructure rather than domain
 * aggregates: sequence counters, serviceability cache, idempotency records,
 * refresh-token sessions and outbound email log.
 */

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const serviceabilityCheckSchema = new mongoose.Schema(
  {
    addressKey: { type: String, required: true, index: true },
    address: { type: addressSchema, required: true },
    checkId: { type: String, required: true, unique: true },
    serviceable: { type: Boolean, required: true },
    technology: { type: String, default: null },
    maxDownloadMbps: { type: Number, default: 0 },
    maxUploadMbps: { type: Number, default: 0 },
    estimatedInstallDays: { type: Number, default: null },
    requiresSiteSurvey: { type: Boolean, default: false },
    reasonCode: { type: String, default: null },
    upstreamReference: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
serviceabilityCheckSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const idempotencyRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    scope: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
idempotencyRecordSchema.index({ key: 1, scope: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const sessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const emailLogSchema = new mongoose.Schema(
  {
    template: { type: String, required: true },
    to: { type: String, required: true },
    reference: { type: String, index: true },
    providerMessageId: { type: String },
    status: { type: String, enum: ['SENT', 'FAILED'], required: true },
    error: { type: String },
  },
  { timestamps: true },
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  Counter: model('Counter', counterSchema),
  ServiceabilityCheck: model('ServiceabilityCheck', serviceabilityCheckSchema),
  IdempotencyRecord: model('IdempotencyRecord', idempotencyRecordSchema),
  Session: model('Session', sessionSchema),
  EmailLog: model('EmailLog', emailLogSchema),
};
```

## apps/ecom-gokinetic/server/src/repositories/cartRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/cartRepository.js`.

```javascript
'use strict';

const Cart = require('../models/Cart');
const { toPlain } = require('./pagination');

/**
 * Cart persistence with optimistic concurrency: every mutation must present
 * the version it read, so two browser tabs cannot silently overwrite each
 * other's changes.
 */
function createCartRepository({ model = Cart } = {}) {
  return {
    async create(cart) {
      const doc = await model.create(cart);
      return toPlain(doc.toObject());
    },

    async findById(cartId) {
      return toPlain(await model.findById(cartId).lean());
    },

    async findOpenByUser(userId) {
      return toPlain(
        await model.findOne({ userId, status: 'OPEN' }).sort({ updatedAt: -1 }).lean(),
      );
    },

    /**
     * Applies `patch` only if the stored version matches `expectedVersion`.
     * @returns {Promise<object|null>} updated cart, or null on version conflict
     */
    async updateVersioned(cartId, expectedVersion, patch) {
      const doc = await model
        .findOneAndUpdate(
          { _id: cartId, version: expectedVersion, status: 'OPEN' },
          { $set: patch, $inc: { version: 1 } },
          { new: true, runValidators: true },
        )
        .lean();
      return toPlain(doc);
    },

    async markCheckedOut(cartId) {
      await model.updateOne({ _id: cartId }, { $set: { status: 'CHECKED_OUT' }, $inc: { version: 1 } });
    },

    /**
     * Open carts with items, owned by a known user, idle since `idleSince`
     * and not yet reminded.
     */
    async findAbandoned({ idleSince, limit = 200 }) {
      const docs = await model
        .find({
          status: 'OPEN',
          userId: { $ne: null },
          'items.0': { $exists: true },
          updatedAt: { $lte: idleSince },
          reminderSentAt: null,
        })
        .limit(limit)
        .lean();
      return docs.map(toPlain);
    },

    async markReminderSent(cartId, at = new Date()) {
      await model.updateOne({ _id: cartId }, { $set: { reminderSentAt: at } });
    },

    async expireStale(now = new Date()) {
      const res = await model.updateMany(
        { status: 'OPEN', expiresAt: { $lte: now } },
        { $set: { status: 'ABANDONED' } },
      );
      return res.modifiedCount;
    },
  };
}

module.exports = { createCartRepository };
```

## apps/ecom-gokinetic/server/src/repositories/identityRepositories.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/identityRepositories.js`.

```javascript
'use strict';

const User = require('../models/User');
const Account = require('../models/Account');
const { Counter, Session } = require('../models/support');
const { toPlain } = require('./pagination');

/** Users, accounts and refresh-token sessions. */

function createUserRepository({ model = User } = {}) {
  return {
    async create(user) {
      const doc = await model.create(user);
      return doc.toObject();
    },
    /** Includes the password hash: for authentication only. */
    async findByEmailWithSecret(email) {
      return model.findOne({ email: email.toLowerCase() }).lean();
    },
    async findById(id) {
      return toPlain(await model.findById(id).lean());
    },
    async findByIdWithSecret(id) {
      return model.findById(id).lean();
    },
    async update(id, patch) {
      return toPlain(await model.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean());
    },
    async listByAccount(accountId) {
      const docs = await model.find({ accountId }).sort({ createdAt: 1 }).lean();
      return docs.map(toPlain);
    },
    async recordLoginFailure(id, { lockThreshold, lockMinutes, now = new Date() }) {
      const doc = await model.findByIdAndUpdate(id, { $inc: { failedLoginCount: 1 } }, { new: true }).lean();
      if (doc && doc.failedLoginCount >= lockThreshold) {
        await model.updateOne(
          { _id: id },
          { $set: { lockedUntil: new Date(now.getTime() + lockMinutes * 60000), failedLoginCount: 0 } },
        );
      }
    },
    async recordLoginSuccess(id, now = new Date()) {
      await model.updateOne({ _id: id }, { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
    },
  };
}

function createAccountRepository({ model = Account, counterModel = Counter } = {}) {
  return {
    async nextSequence(name = 'account') {
      const doc = await counterModel
        .findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true })
        .lean();
      return doc.seq;
    },
    async create(account) {
      const doc = await model.create(account);
      return toPlain(doc.toObject());
    },
    async findByAccountId(accountId) {
      return toPlain(await model.findOne({ accountId }).lean());
    },
    async update(accountId, patch) {
      return toPlain(await model.findOneAndUpdate({ accountId }, { $set: patch }, { new: true }).lean());
    },
    async addAddress(accountId, entry) {
      if (entry.isDefault) {
        await model.updateOne({ accountId }, { $set: { 'addresses.$[].isDefault': false } });
      }
      return toPlain(
        await model.findOneAndUpdate({ accountId }, { $push: { addresses: entry } }, { new: true }).lean(),
      );
    },
    async removeAddress(accountId, addressId) {
      return toPlain(
        await model
          .findOneAndUpdate({ accountId }, { $pull: { addresses: { _id: addressId } } }, { new: true })
          .lean(),
      );
    },
  };
}

function createSessionRepository({ model = Session } = {}) {
  return {
    async create(session) {
      await model.create(session);
    },
    async findByJti(jti) {
      return model.findOne({ jti }).lean();
    },
    /** Marks a refresh token as used and records its successor. */
    async rotate(jti, replacedBy) {
      const res = await model.updateOne(
        { jti, revokedAt: null },
        { $set: { revokedAt: new Date(), replacedBy } },
      );
      return res.modifiedCount === 1;
    },
    /** Revokes an entire token family (refresh-token reuse detected / logout). */
    async revokeFamily(familyId) {
      await model.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },
    async revokeAllForUser(userId) {
      await model.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },
  };
}

module.exports = { createUserRepository, createAccountRepository, createSessionRepository };
```

## apps/ecom-gokinetic/server/src/repositories/infraRepositories.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/infraRepositories.js`.

```javascript
'use strict';

const { ServiceabilityCheck, IdempotencyRecord, EmailLog } = require('../models/support');
const { toPlain } = require('./pagination');

/** Serviceability cache, idempotency records and email audit log. */

function createServiceabilityRepository({ model = ServiceabilityCheck } = {}) {
  return {
    async findFresh(addressKey, now = new Date()) {
      return toPlain(
        await model.findOne({ addressKey, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean(),
      );
    },
    async findByCheckId(checkId) {
      return toPlain(await model.findOne({ checkId }).lean());
    },
    async save(check) {
      const doc = await model.create(check);
      return toPlain(doc.toObject());
    },
  };
}

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

function createIdempotencyRepository({ model = IdempotencyRecord, now = () => new Date() } = {}) {
  return {
    /**
     * Inserts an IN_PROGRESS marker. Returns the existing record when the key
     * was already used, or null when this request now owns the key.
     */
    async begin({ key, scope, requestHash }) {
      try {
        await model.create({
          key,
          scope,
          requestHash,
          state: 'IN_PROGRESS',
          expiresAt: new Date(now().getTime() + IDEMPOTENCY_TTL_MS),
        });
        return null;
      } catch (err) {
        if (err && err.code === 11000) {
          return model.findOne({ key, scope }).lean();
        }
        throw err;
      }
    },
    async complete({ key, scope, responseStatus, responseBody }) {
      await model.updateOne(
        { key, scope },
        { $set: { state: 'COMPLETED', responseStatus, responseBody } },
      );
    },
    async release({ key, scope }) {
      await model.deleteOne({ key, scope, state: 'IN_PROGRESS' });
    },
  };
}

function createEmailLogRepository({ model = EmailLog } = {}) {
  return {
    async record(entry) {
      await model.create(entry);
    },
    async wasSent(template, reference) {
      return Boolean(await model.exists({ template, reference, status: 'SENT' }));
    },
  };
}

module.exports = {
  createServiceabilityRepository,
  createIdempotencyRepository,
  createEmailLogRepository,
};
```

## apps/ecom-gokinetic/server/src/repositories/invoiceRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/invoiceRepository.js`.

```javascript
'use strict';

const Invoice = require('../models/Invoice');
const { paginate, toPlain } = require('./pagination');

function createInvoiceRepository({ model = Invoice } = {}) {
  return {
    /**
     * Inserts an invoice unless one already exists for the same order, kind
     * and period. Returns `{ invoice, created }`.
     */
    async createIfAbsent(invoice) {
      try {
        const doc = await model.create(invoice);
        return { invoice: toPlain(doc.toObject()), created: true };
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.orderNumber) {
          const existing = await model
            .findOne({ orderNumber: invoice.orderNumber, kind: invoice.kind, periodStart: invoice.periodStart })
            .lean();
          return { invoice: toPlain(existing), created: false };
        }
        throw err;
      }
    },

    async findByNumber(invoiceNumber) {
      return toPlain(await model.findOne({ invoiceNumber }).lean());
    },

    async list({ accountId, status, orderNumber }, { page, pageSize }) {
      const filter = {};
      if (accountId) filter.accountId = accountId;
      if (status) filter.status = status;
      if (orderNumber) filter.orderNumber = orderNumber;
      return paginate(model, filter, { page, pageSize, sort: { issuedAt: -1 } });
    },

    async markPaid(invoiceNumber, paidAt = new Date()) {
      return toPlain(
        await model
          .findOneAndUpdate({ invoiceNumber, status: 'ISSUED' }, { $set: { status: 'PAID', paidAt } }, { new: true })
          .lean(),
      );
    },

    async voidOpenForOrder(orderNumber) {
      const res = await model.updateMany({ orderNumber, status: 'ISSUED' }, { $set: { status: 'VOID' } });
      return res.modifiedCount;
    },
  };
}

module.exports = { createInvoiceRepository };
```

## apps/ecom-gokinetic/server/src/repositories/orderRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/orderRepository.js`.

```javascript
'use strict';

const Order = require('../models/Order');
const { paginate, toPlain } = require('./pagination');

function createOrderRepository({ model = Order } = {}) {
  return {
    async create(order) {
      const doc = await model.create(order);
      return toPlain(doc.toObject());
    },

    async findByNumber(orderNumber) {
      return toPlain(await model.findOne({ orderNumber }).lean());
    },

    async list({ accountId, status }, { page, pageSize }) {
      const filter = {};
      if (accountId) filter.accountId = accountId;
      if (status) filter.status = status;
      return paginate(model, filter, { page, pageSize, sort: { createdAt: -1 } });
    },

    /**
     * Compare-and-set status change: only applies when the order is still in
     * `expectedStatus`, preventing double transitions from concurrent jobs.
     * @returns {Promise<object|null>} updated order or null if it moved on
     */
    async transition(orderNumber, expectedStatus, historyEntry, patch = {}) {
      const doc = await model
        .findOneAndUpdate(
          { orderNumber, status: expectedStatus },
          { $set: { ...patch, status: historyEntry.to }, $push: { statusHistory: historyEntry } },
          { new: true },
        )
        .lean();
      return toPlain(doc);
    },

    async updatePayment(orderNumber, paymentPatch) {
      const set = {};
      for (const [key, value] of Object.entries(paymentPatch)) set[`payment.${key}`] = value;
      const doc = await model.findOneAndUpdate({ orderNumber }, { $set: set }, { new: true }).lean();
      return toPlain(doc);
    },

    async findByStatus(status, { olderThan, limit = 50 } = {}) {
      const filter = { status };
      if (olderThan) filter.updatedAt = { $lte: olderThan };
      const docs = await model.find(filter).sort({ updatedAt: 1 }).limit(limit).lean();
      return docs.map(toPlain);
    },

    async countByAccount(accountId) {
      return model.countDocuments({ accountId, status: { $nin: ['CANCELLED', 'FAILED'] } });
    },
  };
}

module.exports = { createOrderRepository };
```

## apps/ecom-gokinetic/server/src/repositories/pagination.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/pagination.js`.

```javascript
'use strict';

/**
 * Runs a paginated query returning the platform envelope
 * `{ items, page, pageSize, total }`.
 *
 * @param {import('mongoose').Model} Model
 * @param {object} filter
 * @param {{page?: number, pageSize?: number, sort?: object, projection?: object}} options
 */
async function paginate(Model, filter, { page = 1, pageSize = 20, sort = { createdAt: -1 }, projection } = {}) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(100, Math.max(1, pageSize));
  const [items, total] = await Promise.all([
    Model.find(filter, projection)
      .sort(sort)
      .skip((safePage - 1) * safeSize)
      .limit(safeSize)
      .lean({ virtuals: true }),
    Model.countDocuments(filter),
  ]);
  return { items: items.map(toPlain), page: safePage, pageSize: safeSize, total };
}

/** Maps a lean document's `_id` to `id` and strips internal fields. */
function toPlain(doc) {
  if (!doc) return doc;
  const { _id, __v, passwordHash, ...rest } = doc;
  return { id: String(_id), ...rest };
}

module.exports = { paginate, toPlain };
```

## apps/ecom-gokinetic/server/src/repositories/productRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/productRepository.js`.

```javascript
'use strict';

const Product = require('../models/Product');
const { paginate, toPlain } = require('./pagination');

const SORTS = {
  price: { monthlyPrice: 1, oneTimePrice: 1, sortOrder: 1 },
  '-price': { monthlyPrice: -1, oneTimePrice: -1, sortOrder: 1 },
  speed: { speedMbps: 1, sortOrder: 1 },
  '-speed': { speedMbps: -1, sortOrder: 1 },
  name: { name: 1 },
};

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Data access for the product catalogue. */
function createProductRepository({ model = Product } = {}) {
  return {
    async findBySku(sku) {
      return toPlain(await model.findOne({ sku: sku.toUpperCase() }).lean());
    },

    async findActiveBySkus(skus) {
      const docs = await model.find({ sku: { $in: skus }, active: true }).lean();
      return docs.map(toPlain);
    },

    /**
     * @param {object} criteria
     * @param {string} [criteria.segment]
     * @param {string} [criteria.type]
     * @param {number} [criteria.minSpeedMbps]
     * @param {number} [criteria.maxMonthlyPrice]
     * @param {string} [criteria.search]
     * @param {string[]} [criteria.onlySkus] restrict to serviceable plans
     * @param {boolean} [criteria.includeInactive]
     */
    async list(criteria, { page, pageSize, sort = 'price' }) {
      const filter = {};
      if (!criteria.includeInactive) filter.active = true;
      if (criteria.segment) filter.segments = criteria.segment;
      if (criteria.type) filter.type = criteria.type;
      if (criteria.minSpeedMbps != null) filter.speedMbps = { $gte: criteria.minSpeedMbps };
      if (criteria.maxMonthlyPrice != null) filter.monthlyPrice = { $lte: criteria.maxMonthlyPrice };
      if (criteria.search) {
        const rx = new RegExp(escapeRegex(criteria.search), 'i');
        filter.$or = [{ name: rx }, { description: rx }, { sku: rx }];
      }
      if (criteria.onlySkus) filter.sku = { $in: criteria.onlySkus };
      return paginate(model, filter, { page, pageSize, sort: SORTS[sort] || SORTS.price });
    },

    async listCompatibleAddons(planSku, segment) {
      const docs = await model
        .find({
          active: true,
          segments: segment,
          type: { $in: ['ADDON', 'HARDWARE'] },
          $or: [{ compatiblePlanSkus: planSku }, { compatiblePlanSkus: { $size: 0 } }],
        })
        .sort({ sortOrder: 1 })
        .lean();
      return docs.map(toPlain);
    },

    async upsert(product) {
      const doc = await model
        .findOneAndUpdate({ sku: product.sku }, { $set: product }, { upsert: true, new: true, runValidators: true })
        .lean();
      return toPlain(doc);
    },

    async deactivate(sku) {
      const doc = await model.findOneAndUpdate({ sku }, { $set: { active: false } }, { new: true }).lean();
      return toPlain(doc);
    },

    /**
     * Atomically reserves hardware stock. Returns false when insufficient
     * stock remains (no partial decrement). Products without `stockOnHand`
     * are not stock-tracked and always succeed.
     */
    async reserveStock(sku, quantity) {
      const tracked = await model.exists({ sku, stockOnHand: { $exists: true } });
      if (!tracked) return true;
      const res = await model.updateOne(
        { sku, stockOnHand: { $gte: quantity } },
        { $inc: { stockOnHand: -quantity } },
      );
      return res.modifiedCount === 1;
    },

    async releaseStock(sku, quantity) {
      await model.updateOne({ sku, stockOnHand: { $exists: true } }, { $inc: { stockOnHand: quantity } });
    },
  };
}

module.exports = { createProductRepository };
```

## apps/ecom-gokinetic/server/src/repositories/promoRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/promoRepository.js`.

```javascript
'use strict';

const { PromoCode, PromoRedemption } = require('../models/PromoCode');
const { paginate, toPlain } = require('./pagination');

function createPromoRepository({ promoModel = PromoCode, redemptionModel = PromoRedemption } = {}) {
  return {
    async findByCode(code) {
      return toPlain(await promoModel.findOne({ code: code.toUpperCase() }).lean());
    },

    async list({ active }, { page, pageSize }) {
      const filter = active === undefined ? {} : { active };
      return paginate(promoModel, filter, { page, pageSize, sort: { createdAt: -1 } });
    },

    async upsert(promo) {
      const doc = await promoModel
        .findOneAndUpdate({ code: promo.code }, { $set: promo }, { upsert: true, new: true, runValidators: true })
        .lean();
      return toPlain(doc);
    },

    async deactivate(code) {
      return toPlain(
        await promoModel.findOneAndUpdate({ code }, { $set: { active: false } }, { new: true }).lean(),
      );
    },

    async countAccountRedemptions(code, accountId) {
      return redemptionModel.countDocuments({ code, accountId, reversedAt: null });
    },

    /**
     * Atomically consumes one redemption slot, respecting `maxRedemptions`.
     * @returns {Promise<boolean>} false if the global limit was hit
     */
    async claimRedemption(code) {
      const res = await promoModel.updateOne(
        {
          code,
          active: true,
          $or: [{ maxRedemptions: null }, { maxRedemptions: { $exists: false } }, { $expr: { $lt: ['$redemptionCount', '$maxRedemptions'] } }],
        },
        { $inc: { redemptionCount: 1 } },
      );
      return res.modifiedCount === 1;
    },

    async recordRedemption({ code, accountId, orderNumber, discountValue }) {
      await redemptionModel.create({ code, accountId, orderNumber, discountValue });
    },

    /** Gives the slot back when an order using the code is cancelled. */
    async reverseRedemption(orderNumber) {
      const redemption = await redemptionModel.findOneAndUpdate(
        { orderNumber, reversedAt: null },
        { $set: { reversedAt: new Date() } },
        { new: true },
      );
      if (redemption) {
        await promoModel.updateOne({ code: redemption.code, redemptionCount: { $gt: 0 } }, { $inc: { redemptionCount: -1 } });
      }
      return Boolean(redemption);
    },
  };
}

module.exports = { createPromoRepository };
```

## apps/ecom-gokinetic/server/src/repositories/quoteRepository.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/repositories/quoteRepository.js`.

```javascript
'use strict';

const Quote = require('../models/Quote');
const { paginate, toPlain } = require('./pagination');

function createQuoteRepository({ model = Quote } = {}) {
  return {
    async create(quote) {
      const doc = await model.create(quote);
      return toPlain(doc.toObject());
    },

    async findByNumber(quoteNumber) {
      return toPlain(await model.findOne({ quoteNumber }).lean());
    },

    async list({ accountId, status }, { page, pageSize }) {
      const filter = {};
      if (accountId) filter.accountId = accountId;
      if (status) filter.status = status;
      return paginate(model, filter, {
        page,
        pageSize,
        sort: { updatedAt: -1 },
        projection: { internalNotes: 0 },
      });
    },

    /**
     * Compare-and-set on both status and revision so a re-price racing with
     * an acceptance cannot slip through.
     */
    async transition(quoteNumber, { expectedStatus, expectedRevision }, historyEntry, patch = {}, push = {}) {
      const filter = { quoteNumber, status: expectedStatus };
      if (expectedRevision !== undefined) filter.revision = expectedRevision;
      const update = {
        $set: { ...patch, status: historyEntry.to },
        $push: { statusHistory: historyEntry, ...push },
      };
      const doc = await model.findOneAndUpdate(filter, update, { new: true }).lean();
      return toPlain(doc);
    },

    async findExpirable(now = new Date(), limit = 200) {
      const docs = await model
        .find({ status: { $in: ['SENT', 'ACCEPTED'] }, validUntil: { $lte: now } })
        .limit(limit)
        .lean();
      return docs.map(toPlain);
    },
  };
}

module.exports = { createQuoteRepository };
```

## apps/ecom-gokinetic/server/src/routes/accountRoutes.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/routes/accountRoutes.js`.

```javascript
'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { paramMatchesBody } = require('../middleware/paramMatchesBody');

/** Account self-service, invoices and back-office promo management. */
function accountRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  const manageUsers = requirePermission('account:manage-users');

  router.use(guards.authenticated, requirePermission('account:read'));
  router.get('/', c.overview);
  router.patch('/profile', validate(schemas.account.updateProfile), c.updateProfile);
  router.post('/addresses', validate(schemas.account.addAddress), c.addAddress);
  router.delete('/addresses/:addressId', validate(schemas.account.addressIdParam, 'params'), c.removeAddress);
  router.get('/users', c.listMembers);
  router.post('/users', manageUsers, validate(schemas.account.inviteUser), c.inviteMember);
  router.post('/users/:userId/disable', manageUsers, validate(schemas.account.userIdParam, 'params'), c.disableMember);
  return router;
}

function invoiceRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  router.use(guards.authenticated, requirePermission('account:read', 'order:read:any'));
  router.get('/', validate(schemas.invoices.list, 'query'), c.listInvoices);
  router.get('/:invoiceNumber', validate(schemas.invoices.invoiceNumberParam, 'params'), c.getInvoice);
  return router;
}

function promoRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  const code = validate(schemas.promos.codeParam, 'params');
  router.use(guards.authenticated, requirePermission('promo:manage'));
  router.get('/', validate(schemas.promos.list, 'query'), c.listPromos);
  router.get('/:code', code, c.getPromo);
  router.put('/:code', code, validate(schemas.promos.upsert), paramMatchesBody('code'), c.upsertPromo);
  router.delete('/:code', code, c.deactivatePromo);
  return router;
}

module.exports = { accountRoutes, invoiceRoutes, promoRoutes };
```

## apps/ecom-gokinetic/server/src/routes/commerceRoutes.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/routes/commerceRoutes.js`.

```javascript
'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { idempotency } = require('../middleware/idempotency');

/**
 * Cart, checkout, order and quote routes.
 */
function cartRoutes({ controllers, guards }) {
  const router = express.Router();
  const { cart: c } = controllers;
  const cartId = validate(schemas.cart.cartIdParam, 'params');
  const item = validate(schemas.cart.itemParam, 'params');

  // Every cart route accepts guests; the service enforces token/ownership.
  router.use(guards.optional);
  router.post('/', validate(schemas.cart.create), c.create);
  router.get('/:cartId', cartId, c.get);
  router.post('/:cartId/items', cartId, validate(schemas.cart.addItem), c.addItem);
  router.patch('/:cartId/items/:sku', item, validate(schemas.cart.updateItem), c.updateItem);
  router.delete('/:cartId/items/:sku', item, c.removeItem);
  router.put('/:cartId/term', cartId, validate(schemas.cart.setTerm), c.setTerm);
  router.put('/:cartId/address', cartId, validate(schemas.cart.setAddress), c.setAddress);
  router.put('/:cartId/promo', cartId, validate(schemas.cart.applyPromo), c.applyPromo);
  router.delete('/:cartId/promo', cartId, c.removePromo);
  router.post('/:cartId/claim', guards.authenticated, cartId, c.claim);
  return router;
}

function checkoutRoutes({ controllers, guards, idempotencyStore }) {
  const router = express.Router();
  router.post(
    '/orders',
    guards.authenticated,
    requirePermission('order:place'),
    idempotency(idempotencyStore),
    validate(schemas.checkout.placeOrder),
    controllers.order.placeOrder,
  );
  return router;
}

function orderRoutes({ controllers, guards }) {
  const router = express.Router();
  const { order: c } = controllers;
  const orderNumber = validate(schemas.orders.orderNumberParam, 'params');
  const read = requirePermission('order:read:own', 'order:read:any');

  router.use(guards.authenticated);
  router.get('/', read, validate(schemas.orders.list, 'query'), c.list);
  router.get('/:orderNumber', read, orderNumber, c.get);
  router.get('/:orderNumber/tracking', read, orderNumber, c.track);
  router.post(
    '/:orderNumber/cancel',
    requirePermission('order:cancel:own', 'order:advance'),
    orderNumber,
    validate(schemas.orders.cancel),
    c.cancel,
  );
  router.post('/:orderNumber/status', requirePermission('order:advance'), orderNumber, validate(schemas.orders.advance), c.advance);
  return router;
}

function quoteRoutes({ controllers, guards, idempotencyStore }) {
  const router = express.Router();
  const { quote: c } = controllers;
  const quoteNumber = validate(schemas.quotes.quoteNumberParam, 'params');
  const read = requirePermission('quote:read:own', 'quote:read:any');
  const agent = requirePermission('quote:price');

  router.use(guards.authenticated);
  router.post('/', requirePermission('quote:request'), validate(schemas.quotes.request), c.request);
  router.get('/', read, validate(schemas.quotes.list, 'query'), c.list);
  router.get('/:quoteNumber', read, quoteNumber, c.get);
  router.post('/:quoteNumber/price', agent, quoteNumber, validate(schemas.quotes.price), c.price);
  router.post('/:quoteNumber/send', agent, quoteNumber, c.send);
  router.post('/:quoteNumber/approve', requirePermission('quote:approve'), quoteNumber, c.approve);
  router.post(
    '/:quoteNumber/reject',
    requirePermission('quote:accept', 'quote:price'),
    quoteNumber,
    validate(schemas.quotes.decision),
    c.reject,
  );
  router.post('/:quoteNumber/accept', requirePermission('quote:accept'), quoteNumber, validate(schemas.quotes.accept), c.accept);
  router.post(
    '/:quoteNumber/convert',
    requirePermission('quote:accept'),
    idempotency(idempotencyStore),
    quoteNumber,
    validate(schemas.quotes.accept),
    c.convert,
  );
  return router;
}

module.exports = { cartRoutes, checkoutRoutes, orderRoutes, quoteRoutes };
```

## apps/ecom-gokinetic/server/src/routes/healthRoutes.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/routes/healthRoutes.js`.

```javascript
'use strict';

const express = require('express');

/**
 * Liveness and readiness probes.
 *
 * - `/health` answers as long as the process is serving requests (used by
 *   the container HEALTHCHECK and the load balancer)
 * - `/health/ready` also requires MongoDB; the orchestrator stops routing
 *   traffic to a pod that loses its database instead of restarting it
 *
 * @param {{ isDatabaseReady: () => boolean, scheduler?: { status(): object[] }, version?: string }} deps
 */
function createHealthRouter({ isDatabaseReady, scheduler, version = process.env.npm_package_version || 'dev' }) {
  const router = express.Router();
  const startedAt = new Date();

  router.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store').json({
      status: 'UP',
      version,
      startedAt: startedAt.toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
    });
  });

  router.get('/ready', (_req, res) => {
    const database = isDatabaseReady() ? 'UP' : 'DOWN';
    const jobs = scheduler ? scheduler.status() : [];
    const status = database === 'UP' ? 'UP' : 'DOWN';
    res
      .status(status === 'UP' ? 200 : 503)
      .set('Cache-Control', 'no-store')
      .json({ status, checks: { database }, jobs: jobs.map(({ name, running, lastRunAt, lastError }) => ({ name, running, lastRunAt, failing: Boolean(lastError) })) });
  });

  return router;
}

module.exports = { createHealthRouter };
```

## apps/ecom-gokinetic/server/src/routes/index.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/routes/index.js`.

```javascript
'use strict';

const express = require('express');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { createAuthController } = require('../controllers/authController');
const { createCatalogController } = require('../controllers/catalogController');
const { createCartController } = require('../controllers/cartController');
const { createOrderController } = require('../controllers/orderController');
const { createQuoteController } = require('../controllers/quoteController');
const { createAccountController } = require('../controllers/accountController');
const { authRoutes, catalogRoutes, serviceabilityRoutes } = require('./publicRoutes');
const { cartRoutes, checkoutRoutes, orderRoutes, quoteRoutes } = require('./commerceRoutes');
const { accountRoutes, invoiceRoutes, promoRoutes } = require('./accountRoutes');

/**
 * Builds the `/api/v1` router from a container.
 * @param {{ container: object, healthRouter?: express.Router }} deps
 */
function createApiRouter({ container, healthRouter }) {
  const { config, services, repos } = container;
  const guards = {
    authenticated: authenticate(config.auth),
    optional: optionalAuthenticate(config.auth),
  };
  const controllers = {
    auth: createAuthController(services),
    catalog: createCatalogController(services),
    cart: createCartController(services),
    order: createOrderController(services),
    quote: createQuoteController(services),
    account: createAccountController(services),
  };
  const deps = { controllers, guards, config, idempotencyStore: repos.idempotency };

  const api = express.Router();
  if (healthRouter) api.use('/health', healthRouter);
  api.use('/auth', authRoutes(deps));
  api.use('/products', catalogRoutes(deps));
  api.use('/serviceability', serviceabilityRoutes(deps));
  api.use('/carts', cartRoutes(deps));
  api.use('/checkout', checkoutRoutes(deps));
  api.use('/orders', orderRoutes(deps));
  api.use('/quotes', quoteRoutes(deps));
  api.use('/account', accountRoutes(deps));
  api.use('/invoices', invoiceRoutes(deps));
  api.use('/promos', promoRoutes(deps));
  return api;
}

module.exports = { createApiRouter };
```

## apps/ecom-gokinetic/server/src/routes/publicRoutes.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/routes/publicRoutes.js`.

```javascript
'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { paramMatchesBody } = require('../middleware/paramMatchesBody');
const { rateLimit } = require('../middleware/rateLimit');

/**
 * Auth, catalogue and serviceability routes: the parts of the API an
 * anonymous shopper can reach (plus catalogue administration).
 */
function authRoutes({ controllers, guards, config }) {
  const router = express.Router();
  const { auth: c } = controllers;
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    name: 'auth',
    keyGenerator: (req) => `ip:${req.ip}`,
  });

  router.post('/register', authLimiter, validate(schemas.auth.register), c.register);
  router.post('/login', authLimiter, validate(schemas.auth.login), c.login);
  router.post('/refresh', authLimiter, validate(schemas.auth.refresh), c.refresh);
  router.post('/logout', validate(schemas.auth.refresh), c.logout);
  router.post('/activate', authLimiter, validate(schemas.account.activateInvite), c.activateInvite);
  router.get('/me', guards.authenticated, c.me);
  router.post('/change-password', guards.authenticated, validate(schemas.auth.changePassword), c.changePassword);
  return router;
}

function catalogRoutes({ controllers, guards }) {
  const router = express.Router();
  const { catalog: c } = controllers;
  const manage = [guards.authenticated, requirePermission('catalog:manage')];

  router.get('/', validate(schemas.catalog.list, 'query'), c.list);
  // Registered before '/:sku' so "compare" is not captured as a SKU.
  router.get('/compare', validate(schemas.catalog.compare, 'query'), c.compare);
  router.get(
    '/:sku',
    validate(schemas.catalog.skuParam, 'params'),
    validate(schemas.catalog.detail, 'query'),
    c.detail,
  );
  router.put(
    '/:sku',
    ...manage,
    validate(schemas.catalog.skuParam, 'params'),
    validate(schemas.catalog.upsert),
    paramMatchesBody('sku'),
    c.upsert,
  );
  router.delete('/:sku', ...manage, validate(schemas.catalog.skuParam, 'params'), c.deactivate);
  return router;
}

function serviceabilityRoutes({ controllers, guards }) {
  const router = express.Router();
  const { catalog: c } = controllers;
  const checkId = validate(schemas.serviceability.checkIdParam, 'params');

  router.post('/checks', guards.optional, validate(schemas.serviceability.check), c.checkAddress);
  router.get('/checks/:checkId', guards.optional, checkId, c.getCheck);
  router.get(
    '/checks/:checkId/install-slots',
    guards.optional,
    checkId,
    validate(schemas.serviceability.slots, 'query'),
    c.installSlots,
  );
  return router;
}

module.exports = { authRoutes, catalogRoutes, serviceabilityRoutes };
```

## apps/ecom-gokinetic/server/src/scripts/seedCatalog.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/scripts/seedCatalog.js`.

```javascript
'use strict';

/**
 * Seeds the starter catalogue and launch promos for local development and
 * fresh environments. Idempotent: products and promos are upserted by key
 * through the same services the admin API uses, so business rules apply.
 *
 * Usage: npm run seed
 */

const config = require('../config');
const { logger } = require('../config/logger');
const { connectDatabase, disconnectDatabase } = require('../config/db');
const { createContainer } = require('../container');

const BOTH = ['CONSUMER', 'BUSINESS'];
const ALL_PLANS = ['GK-FIBRE-100', 'GK-FIBRE-500', 'GK-FIBRE-1000', 'GK-FIBRE-2000', 'BGK-FIBRE-500', 'BGK-FIBRE-1000', 'BGK-FIBRE-2000'];

const plan = (sku, name, segment, speedMbps, uploadMbps, monthlyPrice, installationFee, sortOrder, features) => ({
  sku,
  name,
  type: 'PLAN',
  segments: [segment],
  speedMbps,
  uploadMbps,
  monthlyPrice,
  oneTimePrice: 0,
  installationFee,
  maxQuantity: segment === 'BUSINESS' ? 200 : 1,
  features,
  sortOrder,
});

const PRODUCTS = [
  plan('GK-FIBRE-100', 'Fibre 100', 'CONSUMER', 100, 100, 4500, 9900, 10, ['Unlimited data', 'Symmetrical speeds']),
  plan('GK-FIBRE-500', 'Fibre 500', 'CONSUMER', 500, 500, 6500, 9900, 20, ['Unlimited data', 'Wi-Fi 6 router included']),
  plan('GK-FIBRE-1000', 'Fibre 1 Gig', 'CONSUMER', 1000, 1000, 8000, 9900, 30, ['Unlimited data', 'Wi-Fi 6E router included']),
  plan('GK-FIBRE-2000', 'Fibre 2 Gig', 'CONSUMER', 2000, 2000, 11000, 9900, 40, ['Unlimited data', 'Wi-Fi 7 router included', 'Priority support']),
  plan('BGK-FIBRE-500', 'Business Fibre 500', 'BUSINESS', 500, 500, 9900, 19900, 20, ['99.9% SLA', 'Next-business-day fix']),
  plan('BGK-FIBRE-1000', 'Business Fibre 1 Gig', 'BUSINESS', 1000, 1000, 14900, 19900, 30, ['99.95% SLA', '8-hour fix']),
  plan('BGK-FIBRE-2000', 'Business Fibre 2 Gig', 'BUSINESS', 2000, 2000, 22900, 19900, 40, ['99.95% SLA', '4-hour fix', 'Dedicated account manager']),
  {
    sku: 'ADD-STATIC-IP',
    name: 'Static IP address',
    type: 'ADDON',
    segments: BOTH,
    monthlyPrice: 1000,
    requiresPlan: true,
    compatiblePlanSkus: ALL_PLANS,
    maxQuantity: 8,
    features: ['Single IPv4 address', '/56 IPv6 prefix'],
    sortOrder: 10,
  },
  {
    sku: 'ADD-VOICE-LINE',
    name: 'Home & Office Voice',
    type: 'ADDON',
    segments: BOTH,
    monthlyPrice: 1500,
    installationFee: 0,
    requiresPlan: true,
    compatiblePlanSkus: ALL_PLANS,
    maxQuantity: 4,
    features: ['Unlimited US calling', 'Keep your number'],
    sortOrder: 20,
  },
  {
    sku: 'ADD-WHOLE-HOME-WIFI',
    name: 'Whole-Home Wi-Fi',
    type: 'ADDON',
    segments: ['CONSUMER'],
    monthlyPrice: 1000,
    requiresPlan: true,
    compatiblePlanSkus: ['GK-FIBRE-500', 'GK-FIBRE-1000', 'GK-FIBRE-2000'],
    features: ['Two mesh extenders', 'Coverage guarantee'],
    sortOrder: 30,
  },
  {
    sku: 'HW-MESH-EXTENDER',
    name: 'Mesh extender',
    type: 'HARDWARE',
    segments: BOTH,
    oneTimePrice: 12900,
    maxQuantity: 6,
    stockOnHand: 500,
    features: ['Wi-Fi 6E', 'Wired backhaul port'],
    sortOrder: 40,
  },
  {
    sku: 'HW-LTE-BACKUP',
    name: '4G/LTE failover router',
    type: 'HARDWARE',
    segments: ['BUSINESS'],
    oneTimePrice: 24900,
    maxQuantity: 200,
    stockOnHand: 250,
    features: ['Automatic failover', 'Data plan sold separately'],
    sortOrder: 50,
  },
];

const PROMOS = [
  {
    code: 'WELCOME-3FREE',
    description: 'First three months free on any home fibre plan with a 24-month term.',
    kind: 'FREE_MONTHS',
    freeMonths: 3,
    segments: ['CONSUMER'],
    minContractTermMonths: 24,
    newCustomersOnly: true,
  },
  {
    code: 'FREEINSTALL',
    description: 'Free installation on monthly (no-contract) plans.',
    kind: 'FREE_INSTALLATION',
    segments: ['CONSUMER'],
  },
  {
    code: 'BIZ-10OFF',
    description: '10% off recurring charges for 12 months.',
    kind: 'PERCENT_OFF',
    scope: 'RECURRING',
    valueBps: 1000,
    durationMonths: 12,
    segments: ['BUSINESS'],
    maxRedemptions: 500,
  },
];

async function seed() {
  await connectDatabase(config.mongo.uri);
  const { services } = createContainer(config);
  const defaults = { description: '', oneTimePrice: 0, installationFee: 0, monthlyPrice: 0, requiresPlan: false, compatiblePlanSkus: [], maxQuantity: 1, active: true };
  for (const product of PRODUCTS) {
    await services.catalogService.upsert({ ...defaults, ...product });
  }
  for (const promo of PROMOS) {
    await services.promoService.upsert({ scope: 'ALL', eligibleSkus: [], perAccountLimit: 1, active: true, ...promo });
  }
  logger.info('seed.completed', { products: PRODUCTS.length, promos: PROMOS.length });
}

seed()
  .catch((err) => {
    logger.error('seed.failed', { error: err });
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
```
