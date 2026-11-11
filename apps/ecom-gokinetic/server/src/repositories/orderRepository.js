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
