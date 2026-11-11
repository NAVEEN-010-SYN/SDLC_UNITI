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
