'use strict';

const {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
  ValidationError,
} = require('../errors');
const { QUOTE_STATUS, PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');
const { quoteStateMachine } = require('../domain/stateMachine');
const { generateQuoteNumber } = require('../domain/identifiers');
const { priceItems } = require('../domain/pricing');
const { resolveTaxBps, toPricingLines, itemFromProduct } = require('./pricingContext');
const { mapWithConcurrency, priceSiteDrafts, buildSiteOrder } = require('./quoteHelpers');
const { canAccessAccountResource } = require('../middleware/rbac');
const { logger } = require('../config/logger');

const SITE_CHECK_CONCURRENCY = 5;
const DAY_MS = 24 * 3600 * 1000;

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
      const drafts = priceSiteDrafts(quote, sites, account, now);
      let dueToday = 0;
      for (const draft of drafts) dueToday += draft.pricing.dueToday;

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
        const record = buildSiteOrder({ quote, draft, principal, onCredit, authorization, at: now() });
        created.push(await orders.create(record));
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
