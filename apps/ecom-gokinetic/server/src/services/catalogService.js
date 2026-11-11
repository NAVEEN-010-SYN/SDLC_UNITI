'use strict';

const { NotFoundError, ValidationError } = require('../errors');
const { PRODUCT_TYPES } = require('../domain/constants');

/**
 * Catalogue browsing and administration.
 */
function createCatalogService({ products, serviceability }) {
  /** Business rules that the schema alone cannot express. */
  function assertProductRules(product) {
    const errors = [];
    if (product.type === PRODUCT_TYPES.PLAN) {
      if (!product.speedMbps) errors.push({ path: 'speedMbps', message: 'Plans require a download speed.' });
      if (product.monthlyPrice <= 0) errors.push({ path: 'monthlyPrice', message: 'Plans must have a monthly price.' });
      if (product.requiresPlan) errors.push({ path: 'requiresPlan', message: 'A plan cannot require a plan.' });
      if (product.uploadMbps && product.speedMbps && product.uploadMbps > product.speedMbps) {
        errors.push({ path: 'uploadMbps', message: 'Upload speed cannot exceed download speed.' });
      }
    }
    if (product.type === PRODUCT_TYPES.HARDWARE && product.monthlyPrice > 0 && product.oneTimePrice > 0) {
      errors.push({ path: 'oneTimePrice', message: 'Hardware is either rented monthly or bought outright, not both.' });
    }
    if (product.type !== PRODUCT_TYPES.PLAN && product.compatiblePlanSkus.length > 0 && !product.requiresPlan) {
      errors.push({ path: 'requiresPlan', message: 'Items restricted to plans must set requiresPlan.' });
    }
    if (errors.length) throw new ValidationError(errors);
  }

  return {
    /**
     * Lists products. When `serviceabilityCheckId` is given, plans are limited
     * to those the address can support.
     */
    async list(query, { serviceabilityCheckId } = {}) {
      const criteria = {
        segment: query.segment,
        type: query.type,
        minSpeedMbps: query.minSpeedMbps,
        maxMonthlyPrice: query.maxMonthlyPrice,
        search: query.search,
      };
      if (serviceabilityCheckId) {
        const check = await serviceability.getCheck(serviceabilityCheckId);
        if (query.type === PRODUCT_TYPES.PLAN || !query.type) {
          criteria.type = PRODUCT_TYPES.PLAN;
          criteria.onlySkus = check.availablePlanSkus;
        }
      }
      return products.list(criteria, { page: query.page, pageSize: query.pageSize, sort: query.sort });
    },

    async getBySku(sku) {
      const product = await products.findBySku(sku);
      if (!product || !product.active) throw new NotFoundError('Product', sku);
      return product;
    },

    /** Product detail plus add-ons/hardware that can be bundled with a plan. */
    async getWithBundleOptions(sku, segment) {
      const product = await this.getBySku(sku);
      if (product.type !== PRODUCT_TYPES.PLAN) return { product, addons: [] };
      const addons = await products.listCompatibleAddons(product.sku, segment || product.segments[0]);
      return { product, addons };
    },

    /**
     * Side-by-side comparison of up to four plans with derived metrics
     * (price per Mbps) to help shoppers choose.
     */
    async compare(skus) {
      if (skus.length < 2 || skus.length > 4) {
        throw new ValidationError([{ path: 'skus', message: 'Compare between 2 and 4 plans.' }]);
      }
      const found = await products.findActiveBySkus(skus);
      const missing = skus.filter((s) => !found.some((p) => p.sku === s));
      if (missing.length) throw new NotFoundError('Product', missing.join(','));
      const plans = found.filter((p) => p.type === PRODUCT_TYPES.PLAN);
      if (plans.length !== found.length) {
        throw new ValidationError([{ path: 'skus', message: 'Only plans can be compared.' }]);
      }
      const cheapest = Math.min(...plans.map((p) => p.monthlyPrice));
      const fastest = Math.max(...plans.map((p) => p.speedMbps));
      return plans
        .sort((a, b) => a.speedMbps - b.speedMbps)
        .map((p) => ({
          sku: p.sku,
          name: p.name,
          speedMbps: p.speedMbps,
          uploadMbps: p.uploadMbps,
          monthlyPrice: p.monthlyPrice,
          installationFee: p.installationFee,
          // cents per Mbps, rounded to the nearest cent
          centsPerMbps: Math.round(p.monthlyPrice / p.speedMbps),
          isCheapest: p.monthlyPrice === cheapest,
          isFastest: p.speedMbps === fastest,
          features: p.features,
        }));
    },

    async upsert(product) {
      assertProductRules(product);
      return products.upsert(product);
    },

    async deactivate(sku) {
      const updated = await products.deactivate(sku);
      if (!updated) throw new NotFoundError('Product', sku);
      return updated;
    },
  };
}

module.exports = { createCatalogService };
