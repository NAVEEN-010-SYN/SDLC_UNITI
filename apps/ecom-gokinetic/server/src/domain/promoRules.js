'use strict';

const { PROMO_KINDS, PROMO_SCOPES } = require('./constants');

/**
 * Rule codes returned when a promo code cannot be applied. They are surfaced to
 * the storefront so it can show a precise message.
 */
const PROMO_REJECTIONS = Object.freeze({
  INACTIVE: 'PROMO_INACTIVE',
  NOT_STARTED: 'PROMO_NOT_STARTED',
  EXPIRED: 'PROMO_EXPIRED',
  SEGMENT_MISMATCH: 'PROMO_SEGMENT_MISMATCH',
  USAGE_EXHAUSTED: 'PROMO_USAGE_EXHAUSTED',
  ACCOUNT_LIMIT_REACHED: 'PROMO_ACCOUNT_LIMIT_REACHED',
  MIN_SPEND_NOT_MET: 'PROMO_MIN_SPEND_NOT_MET',
  NO_ELIGIBLE_ITEMS: 'PROMO_NO_ELIGIBLE_ITEMS',
  TERM_TOO_SHORT: 'PROMO_TERM_TOO_SHORT',
  NEW_CUSTOMERS_ONLY: 'PROMO_NEW_CUSTOMERS_ONLY',
});

const MESSAGES = {
  [PROMO_REJECTIONS.INACTIVE]: 'This promo code is no longer available.',
  [PROMO_REJECTIONS.NOT_STARTED]: 'This promo code is not active yet.',
  [PROMO_REJECTIONS.EXPIRED]: 'This promo code has expired.',
  [PROMO_REJECTIONS.SEGMENT_MISMATCH]: 'This promo code is not valid for this storefront.',
  [PROMO_REJECTIONS.USAGE_EXHAUSTED]: 'This promo code has reached its redemption limit.',
  [PROMO_REJECTIONS.ACCOUNT_LIMIT_REACHED]: 'You have already used this promo code.',
  [PROMO_REJECTIONS.MIN_SPEND_NOT_MET]: 'Your order does not meet the minimum monthly spend for this code.',
  [PROMO_REJECTIONS.NO_ELIGIBLE_ITEMS]: 'None of the items in your cart qualify for this code.',
  [PROMO_REJECTIONS.TERM_TOO_SHORT]: 'This promo code requires a longer contract term.',
  [PROMO_REJECTIONS.NEW_CUSTOMERS_ONLY]: 'This promo code is only available to new customers.',
};

/**
 * Checks whether a promo can be applied in a given purchase context.
 *
 * @param {object} promo persisted promo document (plain object)
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {string} ctx.segment CONSUMER | BUSINESS
 * @param {string[]} ctx.skus SKUs in the cart
 * @param {number} ctx.monthlySubtotal list monthly subtotal in minor units
 * @param {number} ctx.contractTermMonths
 * @param {number} [ctx.accountRedemptions] times this account already redeemed it
 * @param {boolean} [ctx.isExistingCustomer]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function evaluatePromoEligibility(promo, ctx) {
  const reject = (code) => ({ ok: false, code, message: MESSAGES[code] });
  const now = ctx.now || new Date();

  if (!promo.active) return reject(PROMO_REJECTIONS.INACTIVE);
  if (promo.startsAt && new Date(promo.startsAt) > now) return reject(PROMO_REJECTIONS.NOT_STARTED);
  if (promo.endsAt && new Date(promo.endsAt) <= now) return reject(PROMO_REJECTIONS.EXPIRED);
  if (promo.segments && promo.segments.length > 0 && !promo.segments.includes(ctx.segment)) {
    return reject(PROMO_REJECTIONS.SEGMENT_MISMATCH);
  }
  if (promo.maxRedemptions != null && (promo.redemptionCount || 0) >= promo.maxRedemptions) {
    return reject(PROMO_REJECTIONS.USAGE_EXHAUSTED);
  }
  if (promo.perAccountLimit != null && (ctx.accountRedemptions || 0) >= promo.perAccountLimit) {
    return reject(PROMO_REJECTIONS.ACCOUNT_LIMIT_REACHED);
  }
  if (promo.newCustomersOnly && ctx.isExistingCustomer) {
    return reject(PROMO_REJECTIONS.NEW_CUSTOMERS_ONLY);
  }
  if (promo.minMonthlySpend && (ctx.monthlySubtotal || 0) < promo.minMonthlySpend) {
    return reject(PROMO_REJECTIONS.MIN_SPEND_NOT_MET);
  }
  if (promo.minContractTermMonths && (ctx.contractTermMonths || 0) < promo.minContractTermMonths) {
    return reject(PROMO_REJECTIONS.TERM_TOO_SHORT);
  }
  if (promo.eligibleSkus && promo.eligibleSkus.length > 0) {
    const hit = (ctx.skus || []).some((sku) => promo.eligibleSkus.includes(sku));
    if (!hit) return reject(PROMO_REJECTIONS.NO_ELIGIBLE_ITEMS);
  }
  return { ok: true };
}

/**
 * Validates the shape of a promo definition before it is persisted.
 * @returns {Array<{path: string, message: string}>} empty when valid
 */
function validatePromoDefinition(promo) {
  const errors = [];
  const push = (path, message) => errors.push({ path, message });
  if (!/^[A-Z0-9-]{4,24}$/.test(promo.code || '')) {
    push('code', 'Code must be 4-24 characters of A-Z, 0-9 or dash.');
  }
  if (!Object.values(PROMO_KINDS).includes(promo.kind)) push('kind', 'Unknown promo kind.');
  if (promo.scope && !Object.values(PROMO_SCOPES).includes(promo.scope)) push('scope', 'Unknown scope.');
  switch (promo.kind) {
    case PROMO_KINDS.PERCENT_OFF:
      if (!Number.isInteger(promo.valueBps) || promo.valueBps <= 0 || promo.valueBps > 10000) {
        push('valueBps', 'Percent promos need valueBps between 1 and 10000.');
      }
      break;
    case PROMO_KINDS.FIXED_OFF:
      if (!Number.isInteger(promo.valueAmount) || promo.valueAmount <= 0) {
        push('valueAmount', 'Fixed promos need a positive valueAmount in minor units.');
      }
      break;
    case PROMO_KINDS.FREE_MONTHS:
      if (!Number.isInteger(promo.freeMonths) || promo.freeMonths < 1 || promo.freeMonths > 12) {
        push('freeMonths', 'Free-month promos need freeMonths between 1 and 12.');
      }
      break;
    default:
      break;
  }
  if (promo.startsAt && promo.endsAt && new Date(promo.startsAt) >= new Date(promo.endsAt)) {
    push('endsAt', 'endsAt must be after startsAt.');
  }
  if (promo.maxRedemptions != null && (!Number.isInteger(promo.maxRedemptions) || promo.maxRedemptions < 1)) {
    push('maxRedemptions', 'maxRedemptions must be a positive integer.');
  }
  return errors;
}

/** Converts a persisted promo into the descriptor the pricing engine expects. */
function toPricingDescriptor(promo) {
  return {
    code: promo.code,
    kind: promo.kind,
    scope: promo.scope || PROMO_SCOPES.ALL,
    valueBps: promo.valueBps,
    valueAmount: promo.valueAmount,
    freeMonths: promo.freeMonths,
    maxDiscountAmount: promo.maxDiscountAmount,
    durationMonths: promo.durationMonths,
    eligibleSkus: promo.eligibleSkus || [],
  };
}

module.exports = {
  PROMO_REJECTIONS,
  evaluatePromoEligibility,
  validatePromoDefinition,
  toPricingDescriptor,
};
