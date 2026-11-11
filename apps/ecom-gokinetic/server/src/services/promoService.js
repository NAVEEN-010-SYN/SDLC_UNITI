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
