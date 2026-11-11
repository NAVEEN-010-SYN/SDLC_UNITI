'use strict';

const Quote = require('../models/Quote');
const { paginate, toPlain } = require('./pagination');

function createQuoteRepository({ model = Quote } = {}) {
  return {
    async create(quote) {
      const doc = await model.create(quote);
      return toPlain(doc.toObject());
    },

    async findByNumber(quoteNumber) {
      return toPlain(await model.findOne({ quoteNumber }).lean());
    },

    async list({ accountId, status }, { page, pageSize }) {
      const filter = {};
      if (accountId) filter.accountId = accountId;
      if (status) filter.status = status;
      return paginate(model, filter, {
        page,
        pageSize,
        sort: { updatedAt: -1 },
        projection: { internalNotes: 0 },
      });
    },

    /**
     * Compare-and-set on both status and revision so a re-price racing with
     * an acceptance cannot slip through.
     */
    async transition(quoteNumber, { expectedStatus, expectedRevision }, historyEntry, patch = {}, push = {}) {
      const filter = { quoteNumber, status: expectedStatus };
      if (expectedRevision !== undefined) filter.revision = expectedRevision;
      const update = {
        $set: { ...patch, status: historyEntry.to },
        $push: { statusHistory: historyEntry, ...push },
      };
      const doc = await model.findOneAndUpdate(filter, update, { new: true }).lean();
      return toPlain(doc);
    },

    async findExpirable(now = new Date(), limit = 200) {
      const docs = await model
        .find({ status: { $in: ['SENT', 'ACCEPTED'] }, validUntil: { $lte: now } })
        .limit(limit)
        .lean();
      return docs.map(toPlain);
    },
  };
}

module.exports = { createQuoteRepository };
