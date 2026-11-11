'use strict';

const { ORDER_STATUS, PAYMENT_STATUS, SEGMENTS } = require('../domain/constants');
const { orderStateMachine } = require('../domain/stateMachine');
const { generateOrderNumber } = require('../domain/identifiers');
const { priceItems } = require('../domain/pricing');
const { resolveTaxBps, toPricingLines } = require('./pricingContext');

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
  const laneCount = Math.min(limit, items.length);
  const lanes = [];
  for (let i = 0; i < laneCount; i += 1) lanes.push(lane());
  await Promise.all(lanes);
  return results;
}

/**
 * Prices each serviceable site separately; the volume tier is kept from the
 * whole quote via siteCountOverride.
 */
function priceSiteDrafts(quote, sites, account, now) {
  const drafts = [];
  for (const site of sites) {
    const pricing = priceItems({
      lines: toPricingLines(quote.items),
      contractTermMonths: quote.contractTermMonths,
      segment: SEGMENTS.BUSINESS,
      negotiatedDiscountBps: quote.negotiatedDiscountBps,
      taxBps: resolveTaxBps(site.address, account),
      siteCountOverride: sites.length,
    });
    drafts.push({ site, pricing, orderNumber: generateOrderNumber(now()) });
  }
  return drafts;
}

/** Builds the SUBMITTED order record for one site of a converted quote. */
function buildSiteOrder({ quote, draft, principal, onCredit, authorization, at }) {
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
  return {
    ...order,
    status: ORDER_STATUS.SUBMITTED,
    statusHistory: [...order.statusHistory, submitEntry],
    contractTermMonths: quote.contractTermMonths,
    serviceAddress: draft.site.address,
    billingAddress: draft.site.address,
    contact: {
      email: quote.contactEmail,
      phone: quote.contactPhone || '0000000000',
      firstName: quote.companyName,
      lastName: '-',
    },
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
  };
}

module.exports = { mapWithConcurrency, priceSiteDrafts, buildSiteOrder };
