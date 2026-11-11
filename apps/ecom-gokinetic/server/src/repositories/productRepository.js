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
