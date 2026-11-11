# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server (part 7 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 11

## Files

- `apps/ecom-gokinetic/server/src/services/orderService.test.js` (81 lines)
- `apps/ecom-gokinetic/server/src/services/pricingContext.js` (80 lines)
- `apps/ecom-gokinetic/server/src/services/promoService.js` (95 lines)
- `apps/ecom-gokinetic/server/src/services/quoteService.js` (397 lines)
- `apps/ecom-gokinetic/server/src/services/quoteService.test.js` (96 lines)
- `apps/ecom-gokinetic/server/src/services/serviceabilityService.js` (133 lines)
- `apps/ecom-gokinetic/server/src/validation/schemas.js` (251 lines)
- `apps/ecom-gokinetic/server/src/validation/schemas.test.js` (69 lines)
- `apps/ecom-gokinetic/server/src/validation/validator.js` (155 lines)
- `apps/ecom-gokinetic/server/tests/api.test.js` (112 lines)
- `apps/ecom-gokinetic/server/tests/support/fakes.js` (516 lines)

## apps/ecom-gokinetic/server/src/services/orderService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/orderService.test.js`.

```javascript
'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');

const { consumer, otherConsumer, agent } = principals;

describe('orderService', () => {
  let world;
  let orders;
  beforeEach(() => {
    world = createWorld();
    orders = world.services.orderService;
  });

  test('processSubmitted captures payment, validates and books the install', async () => {
    const placed = await placeOrder(world, consumer);
    const result = await orders.processSubmitted(placed);
    expect(result).toEqual({ orderNumber: placed.orderNumber, outcome: 'PROVISIONING' });

    const stored = await world.repos.orders.findByNumber(placed.orderNumber);
    expect(stored.status).toBe('PROVISIONING');
    expect(stored.payment).toMatchObject({ status: 'CAPTURED', capturedAmount: placed.dueToday });
    expect(stored.installAppointment).toEqual(new Date('2026-12-01T13:00:00Z'));
    const templates = world.notifier.sent.filter((m) => m.template === 'ORDER_STATUS_CHANGED').map((m) => m.data.status);
    expect(templates).toEqual(['VALIDATED', 'PROVISIONING']);
  });

  test('processSubmitted fails the order and voids payment when the address no longer qualifies', async () => {
    const placed = await placeOrder(world, consumer);
    world.api.qualify = async () => ({ serviceable: false, technology: null, maxDownloadMbps: 0, maxUploadMbps: 0, reasonCode: 'NETWORK_CHANGE' });

    const result = await orders.processSubmitted(placed);
    expect(result.outcome).toBe('FAILED');
    const stored = await world.repos.orders.findByNumber(placed.orderNumber);
    expect(stored).toMatchObject({ status: 'FAILED', payment: expect.objectContaining({ status: 'VOIDED' }) });
    expect(world.gateway.calls.map(([n]) => n)).toEqual(['authorize', 'void']);
  });

  test('customers can cancel before installation and the hold is released', async () => {
    const placed = await placeOrder(world, consumer);
    const cancelled = await orders.cancel(consumer, placed.orderNumber, { reason: 'Moving house' });
    expect(cancelled).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Moving house' });
    expect(cancelled.payment.status).toBe('VOIDED');
  });

  test('cancelling once provisioning has started is refused', async () => {
    const placed = await placeOrder(world, consumer);
    await orders.processSubmitted(placed);
    await expect(orders.cancel(consumer, placed.orderNumber, { reason: 'Changed mind' })).rejects.toMatchObject({
      code: 'ORDER_NOT_CANCELLABLE',
    });
  });

  test('other accounts cannot see the order (404, not 403)', async () => {
    const placed = await placeOrder(world, consumer);
    await expect(orders.get(otherConsumer, placed.orderNumber)).rejects.toMatchObject({ status: 404 });
    await expect(orders.get(agent, placed.orderNumber)).resolves.toMatchObject({ orderNumber: placed.orderNumber });
  });

  test('tracking reports milestones and self-cancel eligibility', async () => {
    const placed = await placeOrder(world, consumer);
    const tracking = await orders.track(consumer, placed.orderNumber);
    expect(tracking.canCancel).toBe(true);
    expect(tracking.timeline.steps.map((s) => s.state)).toEqual(['CURRENT', 'UPCOMING', 'UPCOMING', 'UPCOMING']);
  });

  test('support activation marks the account as an existing customer', async () => {
    const placed = await placeOrder(world, consumer);
    await orders.processSubmitted(placed);
    const active = await orders.advance(agent, placed.orderNumber, { status: 'ACTIVE' });
    expect(active.status).toBe('ACTIVE');
    expect(active.activatedAt).toBeInstanceOf(Date);
    expect(world.repos.accounts.rows.get('ACC-00000001').existingCustomer).toBe(true);
  });

  test('invalid transitions are rejected', async () => {
    const placed = await placeOrder(world, consumer);
    await expect(orders.advance(agent, placed.orderNumber, { status: 'ACTIVE' })).rejects.toMatchObject({ status: 409 });
  });
});
```

## apps/ecom-gokinetic/server/src/services/pricingContext.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/pricingContext.js`.

```javascript
'use strict';

const { STATE_TAX_BPS, DEFAULT_TAX_BPS } = require('../domain/constants');

/**
 * Glue between persisted line items and the pure pricing engine.
 */

/**
 * Resolves the tax rate for a service address.
 * @param {{state?: string}|null} address
 * @param {{taxExempt?: boolean}} [account]
 */
function resolveTaxBps(address, account) {
  if (account && account.taxExempt) return 0;
  if (!address || !address.state) return DEFAULT_TAX_BPS;
  return STATE_TAX_BPS[address.state.toUpperCase()] ?? DEFAULT_TAX_BPS;
}

/** Maps cart/order/quote items into pricing engine lines. */
function toPricingLines(items) {
  return items.map((item) => ({
    sku: item.sku,
    productType: item.productType,
    quantity: item.quantity,
    unitMonthly: item.unitMonthly,
    unitOneTime: item.unitOneTime,
    unitInstallation: item.unitInstallation,
  }));
}

/** Snapshot of a catalogue product as a line item at today's price. */
function itemFromProduct(product, quantity) {
  return {
    sku: product.sku,
    name: product.name,
    productType: product.type,
    quantity,
    unitMonthly: product.monthlyPrice,
    unitOneTime: product.oneTimePrice,
    unitInstallation: product.installationFee,
  };
}

/**
 * Re-applies catalogue prices to stored items and reports which changed or
 * disappeared since they were added.
 * @param {object[]} items stored items
 * @param {Map<string, object>} productsBySku current active catalogue
 */
function refreshItemPrices(items, productsBySku) {
  const refreshed = [];
  const warnings = [];
  for (const item of items) {
    const product = productsBySku.get(item.sku);
    if (!product) {
      warnings.push({ code: 'ITEM_UNAVAILABLE', sku: item.sku, message: `${item.name} is no longer available and was removed.` });
      continue;
    }
    const next = itemFromProduct(product, item.quantity);
    if (
      next.unitMonthly !== item.unitMonthly ||
      next.unitOneTime !== item.unitOneTime ||
      next.unitInstallation !== item.unitInstallation
    ) {
      warnings.push({
        code: 'PRICE_CHANGED',
        sku: item.sku,
        message: `The price of ${item.name} has changed.`,
        previous: { unitMonthly: item.unitMonthly, unitOneTime: item.unitOneTime },
        current: { unitMonthly: next.unitMonthly, unitOneTime: next.unitOneTime },
      });
    }
    refreshed.push({ ...next, addedAt: item.addedAt });
  }
  return { items: refreshed, warnings };
}

module.exports = { resolveTaxBps, toPricingLines, itemFromProduct, refreshItemPrices };
```

## apps/ecom-gokinetic/server/src/services/promoService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/promoService.js`.

```javascript
'use strict';

const { NotFoundError, ValidationError, BusinessRuleError } = require('../errors');
const {
  evaluatePromoEligibility,
  validatePromoDefinition,
  toPricingDescriptor,
  PROMO_REJECTIONS,
} = require('../domain/promoRules');

/**
 * Promo code lookup, eligibility evaluation, redemption bookkeeping and
 * back-office administration.
 */
function createPromoService({ promos, accounts, now = () => new Date() }) {
  return {
    /**
     * Evaluates a code for a purchase context without consuming it.
     * @returns {Promise<{ok: boolean, code?: string, message?: string, descriptor?: object, promo?: object}>}
     */
    async evaluate(code, ctx) {
      const promo = await promos.findByCode(code);
      if (!promo) {
        return { ok: false, code: 'PROMO_NOT_FOUND', message: 'This promo code is not recognised.' };
      }
      let accountRedemptions = 0;
      let isExistingCustomer = false;
      if (ctx.accountId) {
        accountRedemptions = await promos.countAccountRedemptions(promo.code, ctx.accountId);
        const account = await accounts.findByAccountId(ctx.accountId);
        isExistingCustomer = Boolean(account && account.existingCustomer);
      }
      const result = evaluatePromoEligibility(promo, {
        now: now(),
        segment: ctx.segment,
        skus: ctx.skus,
        monthlySubtotal: ctx.monthlySubtotal,
        contractTermMonths: ctx.contractTermMonths,
        accountRedemptions,
        isExistingCustomer,
      });
      if (!result.ok) return result;
      return { ok: true, promo, descriptor: toPricingDescriptor(promo) };
    },

    /**
     * Consumes a redemption slot for a placed order. Must be called after the
     * order number exists so the redemption can be reversed on cancellation.
     */
    async redeem({ code, accountId, orderNumber, discountValue }) {
      const claimed = await promos.claimRedemption(code);
      if (!claimed) {
        throw new BusinessRuleError(PROMO_REJECTIONS.USAGE_EXHAUSTED, 'This promo code has reached its redemption limit.');
      }
      await promos.recordRedemption({ code, accountId, orderNumber, discountValue });
    },

    async reverse(orderNumber) {
      return promos.reverseRedemption(orderNumber);
    },

    async list(query) {
      return promos.list({ active: query.active }, { page: query.page, pageSize: query.pageSize });
    },

    async get(code) {
      const promo = await promos.findByCode(code);
      if (!promo) throw new NotFoundError('Promo code', code);
      return promo;
    },

    /** Creates or updates a promo after validating the kind-specific fields. */
    async upsert(definition) {
      const errors = validatePromoDefinition(definition);
      if (errors.length) throw new ValidationError(errors);
      const existing = await promos.findByCode(definition.code);
      if (existing && existing.redemptionCount > 0 && existing.kind !== definition.kind) {
        throw new BusinessRuleError(
          'PROMO_KIND_LOCKED',
          'The kind of a promo cannot change once it has been redeemed. Create a new code instead.',
        );
      }
      return promos.upsert(definition);
    },

    async deactivate(code) {
      const promo = await promos.deactivate(code);
      if (!promo) throw new NotFoundError('Promo code', code);
      return promo;
    },
  };
}

module.exports = { createPromoService };
```

## apps/ecom-gokinetic/server/src/services/quoteService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/quoteService.js`.

```javascript
'use strict';

const {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
  ValidationError,
} = require('../errors');
const { QUOTE_STATUS, ORDER_STATUS, PAYMENT_STATUS, PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');
const { quoteStateMachine, orderStateMachine } = require('../domain/stateMachine');
const { generateQuoteNumber, generateOrderNumber } = require('../domain/identifiers');
const { priceItems } = require('../domain/pricing');
const { resolveTaxBps, toPricingLines, itemFromProduct } = require('./pricingContext');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const SITE_CHECK_CONCURRENCY = 5;
const DAY_MS = 24 * 3600 * 1000;

/**
 * Runs `worker` over `items` with at most `limit` in flight.
 */
async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

/**
 * Business GoKinetic multi-site quotes.
 *
 * Quote `items` describe the bundle installed at EACH site; pricing multiplies
 * it by the number of serviceable sites so the volume tier reflects the whole
 * estate. Negotiated discounts above the approval threshold need a second
 * support agent to approve (four-eyes) before the quote can be sent.
 */
function createQuoteService({
  quotes,
  products,
  orders,
  accounts,
  serviceability,
  paymentGateway,
  notifier,
  approvalThresholdBps = 1500,
  validityDays = 30,
  portalBaseUrl = 'https://business.gokinetic.example',
  now = () => new Date(),
  log = logger,
}) {
  async function loadAuthorized(principal, quoteNumber) {
    const quote = await quotes.findByNumber(quoteNumber);
    if (!quote || !canAccessAccountResource(principal, quote.accountId, 'quote:read:any')) {
      throw new NotFoundError('Quote', quoteNumber);
    }
    return quote;
  }

  async function resolveItems(requested) {
    const skus = [...new Set(requested.map((i) => i.sku))];
    if (skus.length !== requested.length) {
      throw new ValidationError([{ path: 'items', message: 'Each SKU may appear only once.' }]);
    }
    const found = await products.findActiveBySkus(skus);
    const bySku = new Map(found.map((p) => [p.sku, p]));
    const errors = [];
    requested.forEach((item, i) => {
      const product = bySku.get(item.sku);
      if (!product) errors.push({ path: `items[${i}].sku`, message: 'Unknown or inactive product.' });
      else if (!product.segments.includes(SEGMENTS.BUSINESS)) {
        errors.push({ path: `items[${i}].sku`, message: 'Not available to business customers.' });
      }
    });
    if (errors.length) throw new ValidationError(errors);
    const plans = requested.filter((i) => bySku.get(i.sku).type === PRODUCT_TYPES.PLAN);
    if (plans.length !== 1 || plans[0].quantity !== 1) {
      throw new ValidationError([{ path: 'items', message: 'A site bundle must contain exactly one plan with quantity 1.' }]);
    }
    return requested.map((i) => itemFromProduct(bySku.get(i.sku), i.quantity));
  }

  async function qualifySites(addresses, planSku) {
    return mapWithConcurrency(addresses, SITE_CHECK_CONCURRENCY, async (address) => {
      try {
        const check = await serviceability.check(address, { segment: SEGMENTS.BUSINESS });
        return {
          address: check.address,
          serviceable: check.serviceable && check.availablePlanSkus.includes(planSku),
          maxSpeedMbps: check.maxDownloadMbps,
          checkId: check.checkId,
        };
      } catch (err) {
        log.warn('quote.site_check_failed', { error: err.message });
        return { address, serviceable: null, maxSpeedMbps: null, checkId: null };
      }
    });
  }

  function computePricing(quote, account) {
    const serviceableSites = quote.sites.filter((s) => s.serviceable !== false);
    const siteCount = serviceableSites.length;
    if (siteCount === 0) return null;
    const lines = toPricingLines(quote.items).map((l) => ({ ...l, quantity: l.quantity * siteCount }));
    // Tax is estimated from the first site; per-site orders are taxed exactly on conversion.
    return {
      ...priceItems({
        lines,
        contractTermMonths: quote.contractTermMonths,
        segment: SEGMENTS.BUSINESS,
        negotiatedDiscountBps: quote.negotiatedDiscountBps,
        taxBps: resolveTaxBps(serviceableSites[0].address, account),
      }),
      pricedSiteCount: siteCount,
    };
  }

  async function transition(quote, to, { actor, reason, approved, patch = {}, push = {} } = {}) {
    const entry = quoteStateMachine.transition(quote, to, { actor, reason, approved, at: now() });
    const updated = await quotes.transition(
      quote.quoteNumber,
      { expectedStatus: quote.status, expectedRevision: quote.revision },
      entry,
      patch,
      push,
    );
    if (!updated) {
      throw new BusinessRuleError('QUOTE_CHANGED', 'The quote changed while it was being updated. Reload and retry.');
    }
    return updated;
  }

  async function sendToCustomer(quote) {
    await notifier.send({
      template: 'QUOTE_SENT',
      to: quote.contactEmail,
      reference: `${quote.quoteNumber}:r${quote.revision}`,
      data: { quote, viewUrl: `${portalBaseUrl}/quotes/${quote.quoteNumber}` },
      dedupe: true,
    });
  }

  return {
    async request(principal, input) {
      if (principal.segment !== SEGMENTS.BUSINESS) {
        throw new ForbiddenError('Quotes are available to Business GoKinetic accounts only.');
      }
      const items = await resolveItems(input.items);
      const planSku = items.find((i) => i.productType === PRODUCT_TYPES.PLAN).sku;
      const sites = await qualifySites(input.sites, planSku);
      const account = await accounts.findByAccountId(principal.accountId);

      const draft = {
        quoteNumber: generateQuoteNumber(now()),
        accountId: principal.accountId,
        requestedBy: principal.id,
        companyName: input.companyName,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        items,
        sites,
        contractTermMonths: input.contractTermMonths,
        notes: input.notes,
        negotiatedDiscountBps: 0,
        status: QUOTE_STATUS.REQUESTED,
        statusHistory: [{ from: null, to: QUOTE_STATUS.REQUESTED, at: now(), actor: principal.id }],
        revision: 0,
      };
      const created = await quotes.create(draft);
      const pricing = computePricing(created, account);
      if (!pricing) {
        return transition(created, QUOTE_STATUS.REJECTED, {
          reason: 'None of the requested sites can be served.',
          patch: { pricing: null },
        });
      }
      return transition(created, QUOTE_STATUS.PRICED, {
        actor: 'auto-pricer',
        patch: { pricing, revision: created.revision + 1 },
      });
    },

    async list(principal, query) {
      const isStaff = principal.roles.includes('SUPPORT_AGENT');
      const accountId = isStaff ? query.accountId : principal.accountId;
      return quotes.list({ accountId, status: query.status }, { page: query.page, pageSize: query.pageSize });
    },

    async get(principal, quoteNumber) {
      return loadAuthorized(principal, quoteNumber);
    },

    /** Support agent (re)prices a quote, optionally with a negotiated discount. */
    async price(principal, quoteNumber, input) {
      const quote = await quotes.findByNumber(quoteNumber);
      if (!quote) throw new NotFoundError('Quote', quoteNumber);
      const items = input.items ? await resolveItems(input.items) : quote.items;
      const next = {
        ...quote,
        items,
        contractTermMonths: input.contractTermMonths ?? quote.contractTermMonths,
        negotiatedDiscountBps: input.negotiatedDiscountBps,
      };
      if (input.items) {
        const planSku = items.find((i) => i.productType === PRODUCT_TYPES.PLAN).sku;
        next.sites = await qualifySites(quote.sites.map((s) => s.address), planSku);
      }
      const account = await accounts.findByAccountId(quote.accountId);
      const pricing = computePricing(next, account);
      if (!pricing) throw new BusinessRuleError('NO_SERVICEABLE_SITES', 'None of the quote sites can be served.');

      const requiresApproval = input.negotiatedDiscountBps > approvalThresholdBps;
      return transition(quote, QUOTE_STATUS.PRICED, {
        actor: principal.id,
        patch: {
          items: next.items,
          sites: next.sites,
          contractTermMonths: next.contractTermMonths,
          negotiatedDiscountBps: next.negotiatedDiscountBps,
          pricing,
          requiresApproval,
          pricedBy: principal.id,
          approvedBy: null,
          revision: quote.revision + 1,
        },
        push: input.internalNote ? { internalNotes: `${principal.id}: ${input.internalNote}` } : {},
      });
    },

    /**
     * Sends a priced quote to the customer, or routes it to approval when the
     * discount exceeds the threshold.
     */
    async send(principal, quoteNumber) {
      const quote = await loadAuthorized(principal, quoteNumber);
      if (quote.requiresApproval && !quote.approvedBy) {
        return transition(quote, QUOTE_STATUS.PENDING_APPROVAL, { actor: principal.id });
      }
      const validUntil = new Date(now().getTime() + validityDays * DAY_MS);
      const sent = await transition(quote, QUOTE_STATUS.SENT, {
        actor: principal.id,
        approved: Boolean(quote.approvedBy),
        patch: { validUntil },
      });
      await sendToCustomer(sent);
      return sent;
    },

    async approve(principal, quoteNumber) {
      const quote = await quotes.findByNumber(quoteNumber);
      if (!quote) throw new NotFoundError('Quote', quoteNumber);
      if (quote.status !== QUOTE_STATUS.PENDING_APPROVAL) {
        throw new BusinessRuleError('QUOTE_NOT_PENDING_APPROVAL', 'Only quotes awaiting approval can be approved.');
      }
      if (quote.pricedBy === principal.id) {
        throw new ForbiddenError('A quote must be approved by a different agent than the one who priced it.');
      }
      const validUntil = new Date(now().getTime() + validityDays * DAY_MS);
      const sent = await transition(quote, QUOTE_STATUS.SENT, {
        actor: principal.id,
        approved: true,
        patch: { approvedBy: principal.id, validUntil },
      });
      await sendToCustomer(sent);
      return sent;
    },

    async reject(principal, quoteNumber, { reason }) {
      const quote = await loadAuthorized(principal, quoteNumber);
      return transition(quote, QUOTE_STATUS.REJECTED, { actor: principal.id, reason: reason || 'Declined' });
    },

    async accept(principal, quoteNumber, { poNumber }) {
      const quote = await loadAuthorized(principal, quoteNumber);
      if (quote.accountId !== principal.accountId) throw new ForbiddenError('Only the customer can accept a quote.');
      return transition(quote, QUOTE_STATUS.ACCEPTED, { actor: principal.id, patch: { poNumber: poNumber || null } });
    },

    /**
     * Converts an accepted quote into one SUBMITTED order per serviceable
     * site. Accounts on credit terms are invoiced; others must supply a card
     * token which is authorised for the combined due-today amount.
     */
    async convert(principal, quoteNumber, { paymentToken }) {
      const quote = await loadAuthorized(principal, quoteNumber);
      if (quote.status !== QUOTE_STATUS.ACCEPTED) {
        throw new BusinessRuleError('QUOTE_NOT_ACCEPTED', 'Accept the quote before placing orders.');
      }
      const account = await accounts.findByAccountId(quote.accountId);
      const onCredit = account && account.creditTermsDays > 0;
      if (!onCredit && !paymentToken) {
        throw new ValidationError([{ path: 'paymentToken', message: 'Is required for accounts without credit terms.' }]);
      }
      const sites = quote.sites.filter((s) => s.serviceable);
      const siteCountOverride = sites.length;
      const drafts = sites.map((site) => {
        const pricing = priceItems({
          lines: toPricingLines(quote.items),
          contractTermMonths: quote.contractTermMonths,
          segment: SEGMENTS.BUSINESS,
          negotiatedDiscountBps: quote.negotiatedDiscountBps,
          taxBps: resolveTaxBps(site.address, account),
          siteCountOverride,
        });
        return { site, pricing, orderNumber: generateOrderNumber(now()) };
      });
      const dueToday = drafts.reduce((acc, d) => acc + d.pricing.dueToday, 0);

      let authorization = { status: 'NOT_REQUIRED', reference: null };
      if (!onCredit) {
        authorization = await paymentGateway.authorize({
          orderNumber: `${quote.quoteNumber}-R${quote.revision}`,
          amount: dueToday,
          currency: 'USD',
          paymentToken,
          customerEmail: quote.contactEmail,
        });
      }

      const created = [];
      for (const draft of drafts) {
        const at = now();
        const order = {
          orderNumber: draft.orderNumber,
          accountId: quote.accountId,
          userId: principal.id,
          segment: SEGMENTS.BUSINESS,
          status: ORDER_STATUS.DRAFT,
          items: quote.items,
          statusHistory: [{ from: null, to: ORDER_STATUS.DRAFT, at, actor: principal.id }],
        };
        const submitEntry = orderStateMachine.transition(order, ORDER_STATUS.SUBMITTED, { actor: principal.id, at });
        created.push(
          await orders.create({
            ...order,
            status: ORDER_STATUS.SUBMITTED,
            statusHistory: [...order.statusHistory, submitEntry],
            contractTermMonths: quote.contractTermMonths,
            serviceAddress: draft.site.address,
            billingAddress: draft.site.address,
            contact: { email: quote.contactEmail, phone: quote.contactPhone || '0000000000', firstName: quote.companyName, lastName: '' || '-' },
            pricing: draft.pricing,
            currency: 'USD',
            dueToday: draft.pricing.dueToday,
            monthlyRecurring: draft.pricing.recurring.total,
            serviceabilityCheckId: draft.site.checkId,
            sourceQuoteNumber: quote.quoteNumber,
            submittedAt: at,
            payment: {
              status: onCredit ? PAYMENT_STATUS.NOT_REQUIRED : PAYMENT_STATUS.AUTHORIZED,
              gatewayReference: authorization.reference,
              authorizedAmount: onCredit ? 0 : draft.pricing.dueToday,
            },
          }),
        );
      }
      const converted = await transition(quote, QUOTE_STATUS.CONVERTED, {
        actor: principal.id,
        patch: { convertedOrderNumbers: created.map((o) => o.orderNumber) },
      });
      log.info('quote.converted', { quoteNumber, orders: created.length, dueToday });
      return { quote: converted, orders: created };
    },

    /** Expires SENT/ACCEPTED quotes past their validity. Returns count. */
    async expireDue() {
      const due = await quotes.findExpirable(now());
      let expired = 0;
      for (const quote of due) {
        try {
          const updated = await transition(quote, QUOTE_STATUS.EXPIRED, { actor: 'quote-expiry-job', reason: 'Validity period ended' });
          expired += 1;
          await notifier.send({
            template: 'QUOTE_EXPIRED',
            to: updated.contactEmail,
            reference: `${updated.quoteNumber}:expired`,
            data: { quote: updated },
            dedupe: true,
          });
        } catch (err) {
          log.warn('quote.expire_failed', { quoteNumber: quote.quoteNumber, error: err.message });
        }
      }
      return expired;
    },
  };
}

module.exports = { createQuoteService, mapWithConcurrency };
```

## apps/ecom-gokinetic/server/src/services/quoteService.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/quoteService.test.js`.

```javascript
'use strict';

const { createWorld, principals } = require('../../tests/support/world');
const { ADDRESS } = require('../../tests/support/fakes');

const { businessAdmin, consumer, agent, agent2 } = principals;

const REQUEST = {
  companyName: 'Acme Corp',
  contactEmail: 'ops@acme.example',
  items: [
    { sku: 'BGK-FIBRE-1000', quantity: 1 },
    { sku: 'ADD-STATIC-IP', quantity: 2 },
  ],
  sites: [ADDRESS, { ...ADDRESS, line1: '1 Frontier Rd', city: 'Anchorage', state: 'AK', postalCode: '99501' }, { ...ADDRESS, line1: '400 Congress Ave' }],
  contractTermMonths: 36,
};

describe('quoteService', () => {
  let world;
  let quotes;
  beforeEach(() => {
    world = createWorld({ serviceabilityByZip: { 99501: { serviceable: false } } });
    quotes = world.services.quoteService;
  });

  test('auto-prices only the serviceable sites', async () => {
    const quote = await quotes.request(businessAdmin, REQUEST);
    expect(quote.status).toBe('PRICED');
    expect(quote.sites.map((s) => s.serviceable)).toEqual([true, false, true]);
    expect(quote.pricing.pricedSiteCount).toBe(2);
    expect(quote.pricing.lines.find((l) => l.sku === 'ADD-STATIC-IP').quantity).toBe(4);
  });

  test('consumers cannot request quotes', async () => {
    await expect(quotes.request(consumer, REQUEST)).rejects.toMatchObject({ status: 403 });
  });

  test('a site bundle needs exactly one plan', async () => {
    await expect(
      quotes.request(businessAdmin, { ...REQUEST, items: [{ sku: 'ADD-STATIC-IP', quantity: 1 }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  test('deep discounts need a second agent before the quote is sent', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    const priced = await quotes.price(agent, requested.quoteNumber, { negotiatedDiscountBps: 2000 });
    expect(priced).toMatchObject({ requiresApproval: true, pricedBy: agent.id, revision: requested.revision + 1 });

    const pending = await quotes.send(agent, requested.quoteNumber);
    expect(pending.status).toBe('PENDING_APPROVAL');
    await expect(quotes.approve(agent, requested.quoteNumber)).rejects.toMatchObject({ status: 403 });

    const sent = await quotes.approve(agent2, requested.quoteNumber);
    expect(sent).toMatchObject({ status: 'SENT', approvedBy: agent2.id });
    expect(sent.validUntil).toBeInstanceOf(Date);
    expect(world.notifier.sent.map((m) => m.template)).toContain('QUOTE_SENT');
  });

  test('accepting and converting creates one order per serviceable site', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    await quotes.accept(businessAdmin, requested.quoteNumber, { poNumber: 'PO-7781' });

    await expect(quotes.convert(businessAdmin, requested.quoteNumber, {})).rejects.toMatchObject({ status: 400 });
    const { quote, orders } = await quotes.convert(businessAdmin, requested.quoteNumber, { paymentToken: 'tok_business' });

    expect(quote.status).toBe('CONVERTED');
    expect(orders).toHaveLength(2);
    expect(orders.every((o) => o.status === 'SUBMITTED' && o.sourceQuoteNumber === requested.quoteNumber)).toBe(true);
    const authorizations = world.gateway.calls.filter(([n]) => n === 'authorize');
    expect(authorizations).toHaveLength(1);
    expect(authorizations[0][1].amount).toBe(orders.reduce((a, o) => a + o.dueToday, 0));
    // Each per-site order keeps the volume tier earned by the whole quote.
    expect(orders[0].pricing.siteCount).toBe(2);
  });

  test('accounts on credit terms are invoiced instead of charged', async () => {
    world.repos.accounts.rows.get(businessAdmin.accountId).creditTermsDays = 30;
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    await quotes.accept(businessAdmin, requested.quoteNumber, {});
    const { orders } = await quotes.convert(businessAdmin, requested.quoteNumber, {});
    expect(orders.every((o) => o.payment.status === 'NOT_REQUIRED')).toBe(true);
    expect(world.gateway.calls).toHaveLength(0);
  });

  test('expireDue expires sent quotes past their validity', async () => {
    const requested = await quotes.request(businessAdmin, REQUEST);
    await quotes.send(agent, requested.quoteNumber);
    world.repos.quotes.rows.get(requested.quoteNumber).validUntil = new Date(Date.now() - 1000);
    expect(await quotes.expireDue()).toBe(1);
    expect(world.repos.quotes.rows.get(requested.quoteNumber).status).toBe('EXPIRED');
  });
});
```

## apps/ecom-gokinetic/server/src/services/serviceabilityService.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/services/serviceabilityService.js`.

```javascript
'use strict';

const crypto = require('node:crypto');
const { NotFoundError, BusinessRuleError } = require('../errors');
const { normalizeAddress, addressKey } = require('../domain/address');
const { PRODUCT_TYPES } = require('../domain/constants');
const { logger } = require('../config/logger');

/**
 * Address serviceability: normalise, look up the cache, call the upstream
 * qualification API on a miss, and derive which catalogue plans fit the
 * line's maximum speed.
 */
function createServiceabilityService({
  repository,
  apiClient,
  products,
  cacheTtlHours = 24,
  now = () => new Date(),
  log = logger,
}) {
  async function availablePlans(check, segment) {
    if (!check.serviceable) return [];
    const page = await products.list(
      { type: PRODUCT_TYPES.PLAN, segment },
      { page: 1, pageSize: 100, sort: 'speed' },
    );
    return page.items.filter(
      (p) => p.speedMbps <= check.maxDownloadMbps && (p.technology || 'FTTP') === check.technology,
    );
  }

  function present(check, plans) {
    return {
      checkId: check.checkId,
      address: check.address,
      serviceable: check.serviceable,
      technology: check.technology,
      maxDownloadMbps: check.maxDownloadMbps,
      maxUploadMbps: check.maxUploadMbps,
      estimatedInstallDays: check.estimatedInstallDays,
      requiresSiteSurvey: check.requiresSiteSurvey,
      reasonCode: check.reasonCode,
      upstreamReference: check.upstreamReference || null,
      availablePlanSkus: plans.map((p) => p.sku),
      recommendedPlanSku: recommend(plans),
      checkedAt: new Date(check.createdAt || now()).toISOString(),
      expiresAt: new Date(check.expiresAt).toISOString(),
    };
  }

  /**
   * Picks the plan to highlight: the fastest plan at or under 1 Gbps, falling
   * back to the fastest available when only multi-gig tiers fit.
   */
  function recommend(plans) {
    if (plans.length === 0) return null;
    const gigOrLess = plans.filter((p) => p.speedMbps <= 1000);
    const pool = gigOrLess.length ? gigOrLess : plans;
    return pool.reduce((best, p) => (p.speedMbps > best.speedMbps ? p : best)).sku;
  }

  return {
    /**
     * @param {object} address raw address from the shopper
     * @param {{segment?: string, forceRefresh?: boolean}} [options]
     */
    async check(address, { segment = 'CONSUMER', forceRefresh = false } = {}) {
      const normalized = normalizeAddress(address);
      const key = addressKey(normalized);

      let check = forceRefresh ? null : await repository.findFresh(key, now());
      if (check) {
        log.debug('serviceability.cache_hit', { addressKey: key.slice(0, 12) });
      } else {
        const result = await apiClient.qualify(normalized);
        check = await repository.save({
          addressKey: key,
          address: normalized,
          checkId: crypto.randomUUID(),
          serviceable: result.serviceable,
          technology: result.technology,
          maxDownloadMbps: result.maxDownloadMbps,
          maxUploadMbps: result.maxUploadMbps,
          estimatedInstallDays: result.estimatedInstallDays,
          requiresSiteSurvey: result.requiresSiteSurvey,
          reasonCode: result.reasonCode,
          upstreamReference: result.upstreamReference,
          // Negative results are cached for a shorter period: networks expand.
          expiresAt: new Date(now().getTime() + (result.serviceable ? cacheTtlHours : Math.min(cacheTtlHours, 6)) * 3600000),
        });
        log.info('serviceability.checked', { serviceable: result.serviceable, technology: result.technology });
      }
      const plans = await availablePlans(check, segment);
      return present(check, plans);
    },

    /** Returns a stored check by id, including the plans it qualifies. */
    async getCheck(checkId, { segment = 'CONSUMER' } = {}) {
      const check = await repository.findByCheckId(checkId);
      if (!check) throw new NotFoundError('Serviceability check', checkId);
      const plans = await availablePlans(check, segment);
      return present(check, plans);
    },

    /**
     * Throws unless every plan SKU is deliverable at the checked address.
     * Used by cart and checkout to stop unqualified orders reaching provisioning.
     */
    assertPlansDeliverable(check, planSkus) {
      if (!check.serviceable) {
        throw new BusinessRuleError('ADDRESS_NOT_SERVICEABLE', 'Fibre is not available at this address yet.', {
          reasonCode: check.reasonCode,
        });
      }
      const blocked = planSkus.filter((sku) => !check.availablePlanSkus.includes(sku));
      if (blocked.length) {
        throw new BusinessRuleError(
          'PLAN_NOT_AVAILABLE_AT_ADDRESS',
          `The selected plan is not available at this address (max ${check.maxDownloadMbps} Mbps).`,
          { skus: blocked, maxDownloadMbps: check.maxDownloadMbps },
        );
      }
    },

    isExpired(check) {
      return new Date(check.expiresAt) <= now();
    },
  };
}

module.exports = { createServiceabilityService };
```

## apps/ecom-gokinetic/server/src/validation/schemas.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/validation/schemas.js`.

```javascript
'use strict';

const v = require('./validator');
const {
  SEGMENTS,
  PRODUCT_TYPES,
  ORDER_STATUS,
  QUOTE_STATUS,
  PROMO_KINDS,
  PROMO_SCOPES,
  CONTRACT_TERMS,
} = require('../domain/constants');
const { US_STATES } = require('../domain/address');

/** Request schemas, grouped by resource. Used by the `validate` middleware. */

const contractTerms = Object.keys(CONTRACT_TERMS).map(Number);
const objectId = () => v.string({ pattern: /^[a-f0-9]{24}$/i });
const sku = () => v.string({ min: 3, max: 40, uppercase: true, pattern: /^[A-Z0-9-]+$/ });
const promoCode = () => v.string({ min: 4, max: 24, uppercase: true, pattern: /^[A-Z0-9-]+$/ });

const address = () =>
  v.object({
    line1: v.string({ min: 3, max: 120 }),
    line2: v.string({ max: 60 }).optional(),
    city: v.string({ min: 2, max: 60 }),
    state: v.string({ uppercase: true }).refine((s) => US_STATES.has(s), 'Must be a valid US state code.'),
    postalCode: v.string({ pattern: /^\d{5}(-\d{4})?$/ }),
  });

const password = () =>
  v
    .string({ min: 10, max: 128, trim: false })
    .refine(
      (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p),
      'Must contain upper and lower case letters and a digit.',
    );

const pagination = {
  page: v.integer({ min: 1, coerce: true }).default(1),
  pageSize: v.integer({ min: 1, max: 100, coerce: true }).default(20),
};

const auth = {
  register: v.object({
    email: v.email(),
    password: password(),
    firstName: v.string({ min: 1, max: 60 }),
    lastName: v.string({ min: 1, max: 60 }),
    phone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER),
    businessName: v.string({ min: 2, max: 120 }).optional(),
    marketingOptIn: v.boolean().default(false),
  }),
  login: v.object({
    email: v.email(),
    password: v.string({ min: 1, max: 128, trim: false }),
  }),
  refresh: v.object({ refreshToken: v.string({ min: 20 }) }),
  changePassword: v.object({
    currentPassword: v.string({ min: 1, trim: false }),
    newPassword: password(),
  }),
};

const catalog = {
  list: v.object(
    {
      ...pagination,
      segment: v.oneOf(Object.values(SEGMENTS)).optional(),
      type: v.oneOf(Object.values(PRODUCT_TYPES)).optional(),
      minSpeedMbps: v.integer({ min: 0, coerce: true }).optional(),
      maxMonthlyPrice: v.integer({ min: 0, coerce: true }).optional(),
      search: v.string({ max: 80 }).optional(),
      sort: v.oneOf(['price', '-price', 'speed', '-speed', 'name']).default('price'),
      serviceabilityCheckId: v.string({ pattern: /^[0-9a-f-]{36}$/i }).optional(),
    },
    { allowUnknown: false },
  ),
  compare: v.object({
    skus: v
      .string({ min: 3, max: 200, uppercase: true })
      .refine((s) => s.split(',').every((part) => /^[A-Z0-9-]{3,40}$/.test(part.trim())), 'Must be a comma-separated SKU list.'),
  }),
  detail: v.object({ segment: v.oneOf(Object.values(SEGMENTS)).optional() }),
  skuParam: v.object({ sku: sku() }),
  upsert: v.object({
    sku: sku(),
    name: v.string({ min: 3, max: 120 }),
    description: v.string({ max: 2000 }).default(''),
    type: v.oneOf(Object.values(PRODUCT_TYPES)),
    segments: v.array(v.oneOf(Object.values(SEGMENTS)), { min: 1 }),
    speedMbps: v.integer({ min: 1, max: 10000 }).optional(),
    uploadMbps: v.integer({ min: 1, max: 10000 }).optional(),
    monthlyPrice: v.integer({ min: 0 }).default(0),
    oneTimePrice: v.integer({ min: 0 }).default(0),
    installationFee: v.integer({ min: 0 }).default(0),
    requiresPlan: v.boolean().default(false),
    compatiblePlanSkus: v.array(sku()).default([]),
    maxQuantity: v.integer({ min: 1, max: 500 }).default(1),
    stockOnHand: v.integer({ min: 0 }).optional(),
    features: v.array(v.string({ min: 1, max: 120 }), { max: 20 }).default([]),
    active: v.boolean().default(true),
  }),
};

const serviceability = {
  check: v.object({ address: address(), segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER) }),
  checkIdParam: v.object({ checkId: v.string({ pattern: /^[0-9a-f-]{36}$/i }) }),
  slots: v.object({ days: v.integer({ min: 1, max: 30, coerce: true }).default(14) }),
};

const cart = {
  create: v.object({ segment: v.oneOf(Object.values(SEGMENTS)).default(SEGMENTS.CONSUMER) }),
  addItem: v.object({
    sku: sku(),
    quantity: v.integer({ min: 1, max: 500 }).default(1),
  }),
  updateItem: v.object({ quantity: v.integer({ min: 0, max: 500 }) }),
  setTerm: v.object({ contractTermMonths: v.oneOf(contractTerms) }),
  setAddress: v.object({ address: address() }),
  applyPromo: v.object({ code: promoCode() }),
  cartIdParam: v.object({ cartId: objectId() }),
  itemParam: v.object({ cartId: objectId(), sku: sku() }),
};

const checkout = {
  placeOrder: v.object({
    cartId: objectId(),
    paymentToken: v.string({ min: 8, max: 200 }),
    billingAddress: address().optional(),
    contact: v.object({
      email: v.email(),
      phone: v.string({ pattern: /^\+?1?\d{10}$/ }),
      firstName: v.string({ min: 1, max: 60 }),
      lastName: v.string({ min: 1, max: 60 }),
    }),
    preferredInstallDate: v.isoDate().optional(),
    acceptTerms: v.boolean().refine((b) => b === true, 'Terms and conditions must be accepted.'),
  }),
};

const orders = {
  list: v.object({
    ...pagination,
    status: v.oneOf(Object.values(ORDER_STATUS)).optional(),
    accountId: v.string({ pattern: /^ACC-\d{8}$/ }).optional(),
  }),
  orderNumberParam: v.object({ orderNumber: v.string({ pattern: /^GK-\d{8}-[A-Z0-9]{6}$/ }) }),
  cancel: v.object({ reason: v.string({ min: 3, max: 500 }) }),
  advance: v.object({
    status: v.oneOf(Object.values(ORDER_STATUS)),
    reason: v.string({ max: 500 }).optional(),
  }),
};

const quoteItem = () =>
  v.object({
    sku: sku(),
    quantity: v.integer({ min: 1, max: 500 }),
  });

const quotes = {
  request: v.object({
    companyName: v.string({ min: 2, max: 120 }),
    contactEmail: v.email(),
    contactPhone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    items: v.array(quoteItem(), { min: 1, max: 50 }),
    sites: v.array(address(), { min: 1, max: 200 }),
    contractTermMonths: v.oneOf(contractTerms).default(36),
    notes: v.string({ max: 2000 }).optional(),
  }),
  list: v.object({
    ...pagination,
    status: v.oneOf(Object.values(QUOTE_STATUS)).optional(),
    accountId: v.string({ pattern: /^ACC-\d{8}$/ }).optional(),
  }),
  quoteNumberParam: v.object({ quoteNumber: v.string({ pattern: /^QTE-\d{8}-[A-Z0-9]{4}$/ }) }),
  price: v.object({
    negotiatedDiscountBps: v.integer({ min: 0, max: 5000 }).default(0),
    contractTermMonths: v.oneOf(contractTerms).optional(),
    items: v.array(quoteItem(), { min: 1, max: 50 }).optional(),
    internalNote: v.string({ max: 1000 }).optional(),
  }),
  decision: v.object({ reason: v.string({ max: 500 }).optional() }),
  accept: v.object({ paymentToken: v.string({ min: 8, max: 200 }).optional(), poNumber: v.string({ max: 40 }).optional() }),
};

const promos = {
  upsert: v.object({
    code: promoCode(),
    description: v.string({ max: 300 }).default(''),
    kind: v.oneOf(Object.values(PROMO_KINDS)),
    scope: v.oneOf(Object.values(PROMO_SCOPES)).default(PROMO_SCOPES.ALL),
    valueBps: v.integer({ min: 1, max: 10000 }).optional(),
    valueAmount: v.integer({ min: 1 }).optional(),
    freeMonths: v.integer({ min: 1, max: 12 }).optional(),
    maxDiscountAmount: v.integer({ min: 1 }).optional(),
    durationMonths: v.integer({ min: 1, max: 36 }).optional(),
    segments: v.array(v.oneOf(Object.values(SEGMENTS))).default([]),
    eligibleSkus: v.array(sku()).default([]),
    minMonthlySpend: v.integer({ min: 0 }).optional(),
    minContractTermMonths: v.oneOf(contractTerms).optional(),
    maxRedemptions: v.integer({ min: 1 }).optional(),
    perAccountLimit: v.integer({ min: 1 }).default(1),
    newCustomersOnly: v.boolean().default(false),
    startsAt: v.isoDate().optional(),
    endsAt: v.isoDate().optional(),
    active: v.boolean().default(true),
  }),
  codeParam: v.object({ code: promoCode() }),
  list: v.object({ ...pagination, active: v.boolean({ coerce: true }).optional() }),
};

const account = {
  updateProfile: v.object({
    firstName: v.string({ min: 1, max: 60 }).optional(),
    lastName: v.string({ min: 1, max: 60 }).optional(),
    phone: v.string({ pattern: /^\+?1?\d{10}$/ }).optional(),
    marketingOptIn: v.boolean().optional(),
  }),
  addAddress: v.object({
    label: v.string({ min: 1, max: 40 }),
    address: address(),
    isDefault: v.boolean().default(false),
  }),
  addressIdParam: v.object({ addressId: objectId() }),
  userIdParam: v.object({ userId: objectId() }),
  inviteUser: v.object({
    email: v.email(),
    firstName: v.string({ min: 1, max: 60 }),
    lastName: v.string({ min: 1, max: 60 }),
    role: v.oneOf(['BUSINESS_ADMIN', 'BUSINESS_USER']),
  }),
  activateInvite: v.object({
    token: v.string({ min: 20, max: 2000 }),
    password: password(),
  }),
};

const invoices = {
  list: v.object({
    ...pagination,
    status: v.oneOf(['ISSUED', 'PAID', 'VOID']).optional(),
    orderNumber: v.string({ pattern: /^GK-\d{8}-[A-Z0-9]{6}$/ }).optional(),
  }),
  invoiceNumberParam: v.object({ invoiceNumber: v.string({ pattern: /^INV-\d{6}-[A-Z0-9]{6}$/ }) }),
};

module.exports = { auth, catalog, serviceability, cart, checkout, orders, quotes, promos, account, invoices, address };
```

## apps/ecom-gokinetic/server/src/validation/schemas.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/validation/schemas.test.js`.

```javascript
'use strict';

const { validate } = require('./validator');
const schemas = require('./schemas');

const ADDRESS = { line1: '12 Main Street', city: 'Austin', state: 'tx', postalCode: '78701' };

describe('validator primitives via schemas', () => {
  test('coerces query strings and applies defaults', () => {
    const { value, errors } = validate(schemas.catalog.list, { page: '2', minSpeedMbps: '500' });
    expect(errors).toEqual([]);
    expect(value).toMatchObject({ page: 2, pageSize: 20, minSpeedMbps: 500, sort: 'price' });
  });

  test('rejects unknown fields and reports nested paths', () => {
    const { errors } = validate(schemas.serviceability.check, { address: { ...ADDRESS, postalCode: '7870' }, extra: 1 });
    expect(errors).toEqual(
      expect.arrayContaining([
        { path: 'address.postalCode', message: 'Has an invalid format.' },
        { path: 'extra', message: 'Is not an allowed field.' },
      ]),
    );
  });

  test('normalises state codes and refuses unknown states', () => {
    expect(validate(schemas.cart.setAddress, { address: ADDRESS }).value.address.state).toBe('TX');
    const { errors } = validate(schemas.cart.setAddress, { address: { ...ADDRESS, state: 'ZZ' } });
    expect(errors).toEqual([{ path: 'address.state', message: 'Must be a valid US state code.' }]);
  });

  test('passwords need mixed case and a digit', () => {
    const base = { email: 'A@Example.com', firstName: 'A', lastName: 'B' };
    expect(validate(schemas.auth.register, { ...base, password: 'alllowercase1' }).errors[0].path).toBe('password');
    const ok = validate(schemas.auth.register, { ...base, password: 'Mixed-Case-123' });
    expect(ok.errors).toEqual([]);
    expect(ok.value.email).toBe('a@example.com');
    expect(ok.value.segment).toBe('CONSUMER');
  });

  test('checkout requires accepted terms and parses the install date', () => {
    const body = {
      cartId: 'a'.repeat(24),
      paymentToken: 'tok_12345678',
      contact: { email: 'a@b.co', phone: '5125550100', firstName: 'A', lastName: 'B' },
      preferredInstallDate: '2026-12-01T13:00:00Z',
      acceptTerms: false,
    };
    const { value, errors } = validate(schemas.checkout.placeOrder, body);
    expect(errors).toEqual([{ path: 'acceptTerms', message: 'Terms and conditions must be accepted.' }]);
    expect(validate(schemas.checkout.placeOrder, { ...body, acceptTerms: true }).value.preferredInstallDate).toBeInstanceOf(Date);
    expect(value.preferredInstallDate).toBeInstanceOf(Date);
  });

  test('compare accepts a comma-separated SKU list', () => {
    expect(validate(schemas.catalog.compare, { skus: 'gk-fibre-500,GK-FIBRE-1000' }).errors).toEqual([]);
    expect(validate(schemas.catalog.compare, { skus: 'GK-FIBRE-500,<script>' }).errors).toHaveLength(1);
  });

  test('quote requests bound sites and items', () => {
    const { errors } = validate(schemas.quotes.request, {
      companyName: 'Acme',
      contactEmail: 'ops@acme.example',
      items: [],
      sites: [ADDRESS],
    });
    expect(errors).toEqual([{ path: 'items', message: 'Must contain at least 1 item(s).' }]);
  });
});
```

## apps/ecom-gokinetic/server/src/validation/validator.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/validation/validator.js`.

```javascript
'use strict';

/**
 * Tiny composable schema validator.
 *
 * Each rule is a function `(value, path) => { value, errors }` that returns the
 * coerced value plus field errors in the shared `{ path, message }` format.
 * Kept in-house so validation errors map 1:1 onto problem+json `errors`.
 */

const ok = (value) => ({ value, errors: [] });
const fail = (path, message) => ({ value: undefined, errors: [{ path, message }] });

const isMissing = (value) => value === undefined || value === null;

/**
 * Wraps a raw rule so missing values report "Is required." and attaches the
 * chainable `.optional()`, `.default()` and `.refine()` modifiers.
 */
function withModifiers(rawRule, { allowMissing = false } = {}) {
  const rule = allowMissing
    ? rawRule
    : (value, path) => (isMissing(value) ? fail(path, 'Is required.') : rawRule(value, path));
  rule.optional = () =>
    withModifiers((value, path) => (isMissing(value) ? ok(undefined) : rawRule(value, path)), {
      allowMissing: true,
    });
  rule.default = (fallback) =>
    withModifiers((value, path) => (isMissing(value) ? ok(fallback) : rawRule(value, path)), {
      allowMissing: true,
    });
  rule.refine = (predicate, message) =>
    withModifiers(
      (value, path) => {
        const result = rawRule(value, path);
        if (result.errors.length || result.value === undefined) return result;
        return predicate(result.value) ? result : fail(path, message);
      },
      { allowMissing },
    );
  return rule;
}

function string({ min = 0, max = 10000, pattern, trim = true, lowercase = false, uppercase = false } = {}) {
  return withModifiers((value, path) => {
    if (typeof value !== 'string') return fail(path, 'Must be a string.');
    let v = trim ? value.trim() : value;
    if (lowercase) v = v.toLowerCase();
    if (uppercase) v = v.toUpperCase();
    if (v.length < min) return fail(path, min === 1 ? 'Is required.' : `Must be at least ${min} characters.`);
    if (v.length > max) return fail(path, `Must be at most ${max} characters.`);
    if (pattern && !pattern.test(v)) return fail(path, 'Has an invalid format.');
    return ok(v);
  });
}

function email() {
  return string({ max: 254, lowercase: true }).refine(
    (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    'Must be a valid email address.',
  );
}

function integer({ min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, coerce = false } = {}) {
  return withModifiers((value, path) => {
    let v = value;
    if (coerce && typeof v === 'string' && /^-?\d+$/.test(v.trim())) v = Number.parseInt(v, 10);
    if (!Number.isSafeInteger(v)) return fail(path, 'Must be an integer.');
    if (v < min) return fail(path, `Must be at least ${min}.`);
    if (v > max) return fail(path, `Must be at most ${max}.`);
    return ok(v);
  });
}

function boolean({ coerce = false } = {}) {
  return withModifiers((value, path) => {
    if (typeof value === 'boolean') return ok(value);
    if (coerce && (value === 'true' || value === 'false')) return ok(value === 'true');
    return fail(path, 'Must be a boolean.');
  });
}

function oneOf(values) {
  return withModifiers((value, path) =>
    values.includes(value) ? ok(value) : fail(path, `Must be one of: ${values.join(', ')}.`),
  );
}

function isoDate() {
  return withModifiers((value, path) => {
    if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
      return fail(path, 'Must be an ISO-8601 date-time.');
    }
    return ok(new Date(value));
  });
}

function array(itemRule, { min = 0, max = 1000 } = {}) {
  return withModifiers((value, path) => {
    if (!Array.isArray(value)) return fail(path, 'Must be an array.');
    if (value.length < min) return fail(path, `Must contain at least ${min} item(s).`);
    if (value.length > max) return fail(path, `Must contain at most ${max} item(s).`);
    const out = [];
    const errors = [];
    value.forEach((item, i) => {
      const r = itemRule(item, `${path}[${i}]`);
      errors.push(...r.errors);
      out.push(r.value);
    });
    return { value: out, errors };
  });
}

/**
 * @param {Record<string, Function>} shape
 * @param {{ allowUnknown?: boolean }} [options] unknown keys are rejected by default
 */
function object(shape, { allowUnknown = false } = {}) {
  return withModifiers((value, path) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return fail(path || 'body', 'Must be an object.');
    }
    const out = {};
    const errors = [];
    for (const [key, rule] of Object.entries(shape)) {
      const childPath = path ? `${path}.${key}` : key;
      const r = rule(value[key], childPath);
      errors.push(...r.errors);
      if (r.value !== undefined) out[key] = r.value;
    }
    for (const key of Object.keys(value)) {
      if (!(key in shape)) {
        if (allowUnknown) out[key] = value[key];
        else errors.push({ path: path ? `${path}.${key}` : key, message: 'Is not an allowed field.' });
      }
    }
    return { value: out, errors };
  });
}

/** Accepts anything (used for opaque metadata maps). */
function any() {
  return withModifiers((value) => ok(value));
}

/**
 * Runs a schema and returns `{ value, errors }`. Missing required fields are
 * reported because rules are invoked with `undefined`.
 */
function validate(schema, input) {
  return schema(input, '');
}

module.exports = { string, email, integer, boolean, oneOf, isoDate, array, object, any, validate };
```

## apps/ecom-gokinetic/server/tests/api.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/tests/api.test.js`.

```javascript
'use strict';

const request = require('supertest');
const { createApp } = require('../src/app');
const { createWorld, principals } = require('./support/world');
const { ADDRESS } = require('./support/fakes');

/**
 * HTTP-level tests: routing, validation, auth, problem+json rendering and
 * header contracts, over the real service graph with in-memory storage.
 */
describe('API /api/v1', () => {
  let world;
  let app;
  const bearer = (principal) => `Bearer ${world.services.authService.signAccessToken({ ...principal, _id: principal.id })}`;

  beforeEach(() => {
    world = createWorld();
    app = createApp({ container: world });
  });

  test('health echoes a supplied correlation id', async () => {
    const res = await request(app).get('/api/v1/health').set('X-Correlation-Id', 'trace-12345678');
    expect(res.status).toBe(200);
    expect(res.headers['x-correlation-id']).toBe('trace-12345678');
    expect(res.body.status).toBe('UP');
  });

  test('validation failures are RFC 7807 problems', async () => {
    const res = await request(app).get('/api/v1/products?pageSize=500');
    expect(res.status).toBe(400);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    const body = JSON.parse(res.text);
    expect(body).toMatchObject({ status: 400, title: 'Request validation failed', instance: '/api/v1/products?pageSize=500' });
    expect(body.errors).toEqual([{ path: 'query.pageSize', message: 'Must be at most 100.' }]);
    expect(body.correlationId).toBe(res.headers['x-correlation-id']);
  });

  test('unknown routes and missing auth are problems too', async () => {
    expect((await request(app).get('/api/v1/nope')).status).toBe(404);
    const res = await request(app).get('/api/v1/orders');
    expect(res.status).toBe(401);
    expect(JSON.parse(res.text).type).toMatch(/\/unauthorized$/);
  });

  test('roles are enforced server-side', async () => {
    const res = await request(app)
      .put('/api/v1/products/GK-NEW-PLAN')
      .set('Authorization', bearer(principals.consumer))
      .send({});
    expect(res.status).toBe(403);
  });

  test('catalogue lists only plans the address qualifies for', async () => {
    const check = await request(app).post('/api/v1/serviceability/checks').send({ address: ADDRESS });
    expect(check.status).toBe(201);
    expect(check.headers.location).toBe(`/api/v1/serviceability/checks/${check.body.checkId}`);
    const res = await request(app).get(`/api/v1/products?segment=CONSUMER&serviceabilityCheckId=${check.body.checkId}`);
    expect(res.body.items.map((p) => p.sku)).toEqual(['GK-FIBRE-500', 'GK-FIBRE-1000']);
    expect(res.headers['cache-control']).toBe('private, no-store');
  });

  test('guest cart flow uses the cart token header', async () => {
    const created = await request(app).post('/api/v1/carts').send({ segment: 'CONSUMER' });
    expect(created.status).toBe(201);
    const token = created.headers['x-cart-token'];
    const id = created.body.id;

    const denied = await request(app).post(`/api/v1/carts/${id}/items`).send({ sku: 'GK-FIBRE-1000' });
    expect(denied.status).toBe(403);

    const added = await request(app).post(`/api/v1/carts/${id}/items`).set('X-Cart-Token', token).send({ sku: 'gk-fibre-1000' });
    expect(added.status).toBe(200);
    expect(added.body.items[0]).toMatchObject({ sku: 'GK-FIBRE-1000', quantity: 1 });
  });

  test('checkout requires an Idempotency-Key and replays duplicates', async () => {
    const auth = bearer(principals.consumer);
    const cart = (await request(app).post('/api/v1/carts').set('Authorization', auth).send({ segment: 'CONSUMER' })).body;
    await request(app).post(`/api/v1/carts/${cart.id}/items`).set('Authorization', auth).send({ sku: 'GK-FIBRE-1000' });
    await request(app).put(`/api/v1/carts/${cart.id}/address`).set('Authorization', auth).send({ address: ADDRESS });
    const body = {
      cartId: cart.id,
      paymentToken: 'tok_visa_4242',
      contact: { email: 'ada@example.com', phone: '5125550100', firstName: 'Ada', lastName: 'Lovelace' },
      acceptTerms: true,
    };

    const missing = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).send(body);
    expect(missing.status).toBe(400);

    const key = 'checkout-key-0001-abcdef';
    const first = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).set('Idempotency-Key', key).send(body);
    expect(first.status).toBe(201);
    expect(first.headers.location).toBe(`/api/v1/orders/${first.body.orderNumber}`);

    const replay = await request(app).post('/api/v1/checkout/orders').set('Authorization', auth).set('Idempotency-Key', key).send(body);
    expect(replay.status).toBe(201);
    expect(replay.headers['idempotent-replayed']).toBe('true');
    expect(replay.body.orderNumber).toBe(first.body.orderNumber);
    expect(world.repos.orders.rows.size).toBe(1);
  });

  test('install slots are offered for a qualified address', async () => {
    const check = await request(app).post('/api/v1/serviceability/checks').send({ address: ADDRESS });
    const res = await request(app).get(`/api/v1/serviceability/checks/${check.body.checkId}/install-slots?days=3`);
    expect(res.status).toBe(200);
    expect(res.body.slots).toHaveLength(3);
    expect(res.body.slots[0].windows[0]).toHaveProperty('startsAt');
  });
});
```

## apps/ecom-gokinetic/server/tests/support/fakes.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/tests/support/fakes.js`.

```javascript
'use strict';

/**
 * In-memory implementations of the repository and integration contracts,
 * used by service and API tests so business logic can be exercised without
 * MongoDB or network access. Each mirrors the semantics the services rely
 * on (versioned updates, compare-and-set transitions, unique keys).
 */

const crypto = require('node:crypto');

const clone = (value) => (value === undefined ? value : structuredClone(value));
const newId = () => crypto.randomBytes(12).toString('hex');

/** Applies `{ 'a.b': 1, c: 2 }` style patches, as Mongo's $set does. */
function applySet(target, patch) {
  for (const [path, value] of Object.entries(patch)) {
    const keys = path.split('.');
    let node = target;
    keys.slice(0, -1).forEach((k) => {
      node[k] = node[k] && typeof node[k] === 'object' ? node[k] : {};
      node = node[k];
    });
    node[keys[keys.length - 1]] = value;
  }
  return target;
}

function paginateArray(items, { page = 1, pageSize = 20 }) {
  const start = (page - 1) * pageSize;
  return { items: clone(items.slice(start, start + pageSize)), page, pageSize, total: items.length };
}

function memoryProducts(seed = []) {
  const rows = seed.map((p) => ({
    id: newId(),
    description: '',
    oneTimePrice: 0,
    installationFee: 0,
    monthlyPrice: 0,
    requiresPlan: false,
    compatiblePlanSkus: [],
    maxQuantity: 1,
    active: true,
    features: [],
    technology: 'FTTP',
    ...p,
  }));
  const find = (sku) => rows.find((p) => p.sku === sku);
  return {
    rows,
    async findBySku(sku) {
      return clone(find(sku.toUpperCase()) || null);
    },
    async findActiveBySkus(skus) {
      return clone(rows.filter((p) => p.active && skus.includes(p.sku)));
    },
    async list(criteria, { page, pageSize, sort }) {
      let out = rows.filter((p) => criteria.includeInactive || p.active);
      if (criteria.segment) out = out.filter((p) => p.segments.includes(criteria.segment));
      if (criteria.type) out = out.filter((p) => p.type === criteria.type);
      if (criteria.onlySkus) out = out.filter((p) => criteria.onlySkus.includes(p.sku));
      if (sort === 'speed') out = [...out].sort((a, b) => (a.speedMbps || 0) - (b.speedMbps || 0));
      return paginateArray(out, { page, pageSize });
    },
    async listCompatibleAddons(planSku, segment) {
      return clone(
        rows.filter(
          (p) =>
            p.active &&
            p.segments.includes(segment) &&
            p.type !== 'PLAN' &&
            (p.compatiblePlanSkus.length === 0 || p.compatiblePlanSkus.includes(planSku)),
        ),
      );
    },
    async upsert(product) {
      const existing = find(product.sku);
      if (existing) Object.assign(existing, product);
      else rows.push({ id: newId(), ...product });
      return clone(find(product.sku));
    },
    async deactivate(sku) {
      const p = find(sku);
      if (!p) return null;
      p.active = false;
      return clone(p);
    },
    async reserveStock(sku, quantity) {
      const p = find(sku);
      if (!p || p.stockOnHand == null) return true;
      if (p.stockOnHand < quantity) return false;
      p.stockOnHand -= quantity;
      return true;
    },
    async releaseStock(sku, quantity) {
      const p = find(sku);
      if (p && p.stockOnHand != null) p.stockOnHand += quantity;
    },
  };
}

function memoryCarts() {
  const rows = new Map();
  return {
    rows,
    async create(cart) {
      const row = { id: newId(), version: 0, status: 'OPEN', promoCode: null, serviceAddress: null, serviceability: null, reminderSentAt: null, updatedAt: new Date(), ...clone(cart) };
      rows.set(row.id, row);
      return clone(row);
    },
    async findById(id) {
      return clone(rows.get(id) || null);
    },
    async findOpenByUser(userId) {
      return clone([...rows.values()].find((c) => c.userId === userId && c.status === 'OPEN') || null);
    },
    async updateVersioned(id, expectedVersion, patch) {
      const row = rows.get(id);
      if (!row || row.version !== expectedVersion || row.status !== 'OPEN') return null;
      Object.assign(row, clone(patch), { version: row.version + 1, updatedAt: new Date() });
      return clone(row);
    },
    async markCheckedOut(id) {
      const row = rows.get(id);
      row.status = 'CHECKED_OUT';
    },
    async findAbandoned({ idleSince }) {
      return clone(
        [...rows.values()].filter(
          (c) => c.status === 'OPEN' && c.userId && c.items.length && c.updatedAt <= idleSince && !c.reminderSentAt,
        ),
      );
    },
    async markReminderSent(id, at) {
      rows.get(id).reminderSentAt = at;
    },
    async expireStale(now) {
      let count = 0;
      for (const c of rows.values()) {
        if (c.status === 'OPEN' && c.expiresAt <= now) {
          c.status = 'ABANDONED';
          count += 1;
        }
      }
      return count;
    },
  };
}

function memoryOrders() {
  const rows = new Map();
  return {
    rows,
    async create(order) {
      if (rows.has(order.orderNumber)) throw Object.assign(new Error('dup'), { code: 11000 });
      const row = { id: newId(), createdAt: new Date(), ...clone(order) };
      row.payment = { status: 'PENDING', capturedAmount: 0, refundedAmount: 0, ...(row.payment || {}) };
      rows.set(order.orderNumber, row);
      return clone(row);
    },
    async findByNumber(n) {
      return clone(rows.get(n) || null);
    },
    async list({ accountId, status }, { page, pageSize }) {
      const items = [...rows.values()].filter((o) => (!accountId || o.accountId === accountId) && (!status || o.status === status));
      return paginateArray(items, { page, pageSize });
    },
    async transition(n, expectedStatus, entry, patch = {}) {
      const row = rows.get(n);
      if (!row || row.status !== expectedStatus) return null;
      applySet(row, clone(patch));
      row.status = entry.to;
      row.statusHistory = [...(row.statusHistory || []), entry];
      return clone(row);
    },
    async updatePayment(n, paymentPatch) {
      const row = rows.get(n);
      row.payment = { ...row.payment, ...clone(paymentPatch) };
      return clone(row);
    },
    async findByStatus(status) {
      return clone([...rows.values()].filter((o) => o.status === status));
    },
    async countByAccount(accountId) {
      return [...rows.values()].filter((o) => o.accountId === accountId).length;
    },
  };
}

function memoryAccounts(seed = []) {
  const rows = new Map(seed.map((a) => [a.accountId, { addresses: [], creditTermsDays: 0, taxExempt: false, existingCustomer: false, status: 'ACTIVE', ...a }]));
  let seq = 0;
  return {
    rows,
    async nextSequence() {
      seq += 1;
      return seq;
    },
    async create(account) {
      rows.set(account.accountId, { addresses: [], creditTermsDays: 0, ...clone(account) });
      return clone(rows.get(account.accountId));
    },
    async findByAccountId(id) {
      return clone(rows.get(id) || null);
    },
    async update(id, patch) {
      const row = rows.get(id);
      if (!row) return null;
      Object.assign(row, clone(patch));
      return clone(row);
    },
    async addAddress(id, entry) {
      const row = rows.get(id);
      if (entry.isDefault) row.addresses.forEach((a) => { a.isDefault = false; });
      row.addresses.push({ _id: newId(), ...clone(entry) });
      return clone(row);
    },
    async removeAddress(id, addressId) {
      const row = rows.get(id);
      row.addresses = row.addresses.filter((a) => a._id !== addressId);
      return clone(row);
    },
  };
}

function memoryUsers(seed = []) {
  const rows = new Map(seed.map((u) => [u.id, { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, ...u, _id: u.id }]));
  return {
    rows,
    async create(user) {
      const id = newId();
      const row = { status: 'ACTIVE', failedLoginCount: 0, lockedUntil: null, ...clone(user), id, _id: id };
      rows.set(id, row);
      return clone(row);
    },
    async findByEmailWithSecret(email) {
      return clone([...rows.values()].find((u) => u.email === email.toLowerCase()) || null);
    },
    async findById(id) {
      const row = rows.get(String(id));
      if (!row) return null;
      const { passwordHash, ...rest } = clone(row);
      return rest;
    },
    async findByIdWithSecret(id) {
      return clone(rows.get(String(id)) || null);
    },
    async update(id, patch) {
      const row = rows.get(String(id));
      if (!row) return null;
      Object.assign(row, clone(patch));
      return this.findById(id);
    },
    async listByAccount(accountId) {
      return [...rows.values()].filter((u) => u.accountId === accountId).map(({ passwordHash, ...u }) => clone(u));
    },
    async recordLoginFailure(id, { lockThreshold, lockMinutes, now }) {
      const row = rows.get(String(id));
      row.failedLoginCount += 1;
      if (row.failedLoginCount >= lockThreshold) {
        row.lockedUntil = new Date(now.getTime() + lockMinutes * 60000);
        row.failedLoginCount = 0;
      }
    },
    async recordLoginSuccess(id, now) {
      Object.assign(rows.get(String(id)), { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now });
    },
  };
}

function memorySessions() {
  const rows = new Map();
  return {
    rows,
    async create(s) {
      rows.set(s.jti, { revokedAt: null, replacedBy: null, ...s });
    },
    async findByJti(jti) {
      return clone(rows.get(jti) || null);
    },
    async rotate(jti, replacedBy) {
      const s = rows.get(jti);
      if (!s || s.revokedAt) return false;
      Object.assign(s, { revokedAt: new Date(), replacedBy });
      return true;
    },
    async revokeFamily(familyId) {
      for (const s of rows.values()) if (s.familyId === familyId && !s.revokedAt) s.revokedAt = new Date();
    },
    async revokeAllForUser(userId) {
      for (const s of rows.values()) if (s.userId === userId && !s.revokedAt) s.revokedAt = new Date();
    },
  };
}

function memoryPromos(seed = []) {
  const promos = new Map(seed.map((p) => [p.code, { active: true, redemptionCount: 0, segments: [], eligibleSkus: [], perAccountLimit: 1, ...p }]));
  const redemptions = [];
  return {
    promos,
    redemptions,
    async findByCode(code) {
      return clone(promos.get(code.toUpperCase()) || null);
    },
    async countAccountRedemptions(code, accountId) {
      return redemptions.filter((r) => r.code === code && r.accountId === accountId && !r.reversedAt).length;
    },
    async claimRedemption(code) {
      const p = promos.get(code);
      if (!p || !p.active) return false;
      if (p.maxRedemptions != null && p.redemptionCount >= p.maxRedemptions) return false;
      p.redemptionCount += 1;
      return true;
    },
    async recordRedemption(r) {
      redemptions.push({ ...r, reversedAt: null });
    },
    async reverseRedemption(orderNumber) {
      const r = redemptions.find((x) => x.orderNumber === orderNumber && !x.reversedAt);
      if (!r) return false;
      r.reversedAt = new Date();
      promos.get(r.code).redemptionCount -= 1;
      return true;
    },
    async list({ active }, opts) {
      return paginateArray([...promos.values()].filter((p) => active === undefined || p.active === active), opts);
    },
    async upsert(p) {
      promos.set(p.code, { redemptionCount: 0, ...(promos.get(p.code) || {}), ...clone(p) });
      return clone(promos.get(p.code));
    },
    async deactivate(code) {
      const p = promos.get(code);
      if (!p) return null;
      p.active = false;
      return clone(p);
    },
  };
}

function memoryQuotes() {
  const rows = new Map();
  return {
    rows,
    async create(q) {
      const row = { id: newId(), internalNotes: [], convertedOrderNumbers: [], ...clone(q) };
      rows.set(q.quoteNumber, row);
      return clone(row);
    },
    async findByNumber(n) {
      return clone(rows.get(n) || null);
    },
    async list({ accountId, status }, opts) {
      return paginateArray([...rows.values()].filter((q) => (!accountId || q.accountId === accountId) && (!status || q.status === status)), opts);
    },
    async transition(n, { expectedStatus, expectedRevision }, entry, patch = {}, push = {}) {
      const row = rows.get(n);
      if (!row || row.status !== expectedStatus) return null;
      if (expectedRevision !== undefined && row.revision !== expectedRevision) return null;
      Object.assign(row, clone(patch), { status: entry.to });
      row.statusHistory = [...(row.statusHistory || []), entry];
      for (const [key, value] of Object.entries(push)) row[key] = [...(row[key] || []), value];
      return clone(row);
    },
    async findExpirable(now) {
      return clone([...rows.values()].filter((q) => ['SENT', 'ACCEPTED'].includes(q.status) && q.validUntil && new Date(q.validUntil) <= now));
    },
  };
}

function memoryInvoices() {
  const rows = [];
  return {
    rows,
    async createIfAbsent(invoice) {
      const key = (i) => `${i.orderNumber}|${i.kind}|${i.periodStart ? new Date(i.periodStart).toISOString() : ''}`;
      const existing = rows.find((r) => key(r) === key(invoice));
      if (existing) return { invoice: clone(existing), created: false };
      const row = { id: newId(), ...clone(invoice) };
      rows.push(row);
      return { invoice: clone(row), created: true };
    },
    async findByNumber(n) {
      return clone(rows.find((r) => r.invoiceNumber === n) || null);
    },
    async list({ accountId, status, orderNumber }, opts) {
      return paginateArray(
        rows.filter((r) => (!accountId || r.accountId === accountId) && (!status || r.status === status) && (!orderNumber || r.orderNumber === orderNumber)),
        opts,
      );
    },
    async voidOpenForOrder(orderNumber) {
      let n = 0;
      rows.forEach((r) => {
        if (r.orderNumber === orderNumber && r.status === 'ISSUED') {
          r.status = 'VOID';
          n += 1;
        }
      });
      return n;
    },
  };
}

function memoryServiceabilityChecks() {
  const rows = [];
  return {
    rows,
    async findFresh(addressKey, now) {
      return clone(rows.filter((r) => r.addressKey === addressKey && r.expiresAt > now).pop() || null);
    },
    async findByCheckId(checkId) {
      return clone(rows.find((r) => r.checkId === checkId) || null);
    },
    async save(check) {
      const row = { ...clone(check), createdAt: new Date() };
      rows.push(row);
      return clone(row);
    },
  };
}

function fakeNotifier() {
  const sent = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
      return { sent: true };
    },
  };
}

function fakePaymentGateway({ decline = null } = {}) {
  const calls = [];
  return {
    calls,
    decline,
    async authorize(args) {
      calls.push(['authorize', args]);
      if (this.decline) throw this.decline;
      if (args.amount === 0) return { reference: null, status: 'NOT_REQUIRED', last4: null, brand: null };
      return { reference: `auth_${args.orderNumber}`, status: 'AUTHORIZED', last4: '4242', brand: 'visa' };
    },
    async capture(args) {
      calls.push(['capture', args]);
      return { reference: args.reference, capturedAmount: args.amount };
    },
    async void(args) {
      calls.push(['void', args]);
      return { reference: args.reference, status: 'VOIDED' };
    },
    async refund(args) {
      calls.push(['refund', args]);
      return { refundId: 'rf_1', amount: args.amount };
    },
  };
}

/** Upstream qualification API returning a configurable result per ZIP code. */
function fakeServiceabilityApi(byZip = {}, fallback = { serviceable: true, maxDownloadMbps: 1000 }) {
  const calls = [];
  return {
    calls,
    async qualify(address) {
      calls.push(address);
      const r = byZip[address.postalCode] || fallback;
      return {
        serviceable: r.serviceable,
        technology: r.serviceable ? 'FTTP' : null,
        maxDownloadMbps: r.serviceable ? r.maxDownloadMbps : 0,
        maxUploadMbps: r.serviceable ? r.maxDownloadMbps : 0,
        estimatedInstallDays: r.estimatedInstallDays ?? 5,
        requiresSiteSurvey: Boolean(r.requiresSiteSurvey),
        reasonCode: r.serviceable ? null : 'NOT_QUALIFIED',
        upstreamReference: r.serviceable ? `q-${address.postalCode}` : null,
      };
    },
    async reserveInstallSlot({ orderNumber }) {
      return { appointmentId: `appt-${orderNumber}`, scheduledFor: new Date('2026-12-01T13:00:00Z') };
    },
  };
}

/** Standard test catalogue: consumer + business plans, an add-on, hardware. */
const CATALOGUE = [
  { sku: 'GK-FIBRE-500', name: 'Fibre 500', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 500, uploadMbps: 500, monthlyPrice: 6500, installationFee: 9900 },
  { sku: 'GK-FIBRE-1000', name: 'Fibre 1 Gig', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 1000, uploadMbps: 1000, monthlyPrice: 8000, installationFee: 9900 },
  { sku: 'GK-FIBRE-2000', name: 'Fibre 2 Gig', type: 'PLAN', segments: ['CONSUMER'], speedMbps: 2000, uploadMbps: 2000, monthlyPrice: 11000, installationFee: 9900 },
  { sku: 'BGK-FIBRE-1000', name: 'Business Fibre 1 Gig', type: 'PLAN', segments: ['BUSINESS'], speedMbps: 1000, uploadMbps: 1000, monthlyPrice: 14900, installationFee: 19900, maxQuantity: 200 },
  { sku: 'ADD-STATIC-IP', name: 'Static IP', type: 'ADDON', segments: ['CONSUMER', 'BUSINESS'], monthlyPrice: 1000, requiresPlan: true, compatiblePlanSkus: ['GK-FIBRE-1000', 'GK-FIBRE-2000', 'BGK-FIBRE-1000'], maxQuantity: 8 },
  { sku: 'HW-MESH-EXTENDER', name: 'Mesh extender', type: 'HARDWARE', segments: ['CONSUMER', 'BUSINESS'], oneTimePrice: 12900, maxQuantity: 6, stockOnHand: 2 },
];

const ADDRESS = { line1: '12 Main Street', city: 'Austin', state: 'TX', postalCode: '78701' };

module.exports = {
  applySet,
  memoryProducts,
  memoryCarts,
  memoryOrders,
  memoryAccounts,
  memoryUsers,
  memorySessions,
  memoryPromos,
  memoryQuotes,
  memoryInvoices,
  memoryServiceabilityChecks,
  fakeNotifier,
  fakePaymentGateway,
  fakeServiceabilityApi,
  CATALOGUE,
  ADDRESS,
};
```
