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
