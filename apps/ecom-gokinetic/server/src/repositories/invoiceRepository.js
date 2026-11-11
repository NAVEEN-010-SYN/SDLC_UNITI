'use strict';

const Invoice = require('../models/Invoice');
const { paginate, toPlain } = require('./pagination');

function createInvoiceRepository({ model = Invoice } = {}) {
  return {
    /**
     * Inserts an invoice unless one already exists for the same order, kind
     * and period. Returns `{ invoice, created }`.
     */
    async createIfAbsent(invoice) {
      try {
        const doc = await model.create(invoice);
        return { invoice: toPlain(doc.toObject()), created: true };
      } catch (err) {
        if (err && err.code === 11000 && err.keyPattern && err.keyPattern.orderNumber) {
          const existing = await model
            .findOne({ orderNumber: invoice.orderNumber, kind: invoice.kind, periodStart: invoice.periodStart })
            .lean();
          return { invoice: toPlain(existing), created: false };
        }
        throw err;
      }
    },

    async findByNumber(invoiceNumber) {
      return toPlain(await model.findOne({ invoiceNumber }).lean());
    },

    async list({ accountId, status, orderNumber }, { page, pageSize }) {
      const filter = {};
      if (accountId) filter.accountId = accountId;
      if (status) filter.status = status;
      if (orderNumber) filter.orderNumber = orderNumber;
      return paginate(model, filter, { page, pageSize, sort: { issuedAt: -1 } });
    },

    async markPaid(invoiceNumber, paidAt = new Date()) {
      return toPlain(
        await model
          .findOneAndUpdate({ invoiceNumber, status: 'ISSUED' }, { $set: { status: 'PAID', paidAt } }, { new: true })
          .lean(),
      );
    },

    async voidOpenForOrder(orderNumber) {
      const res = await model.updateMany({ orderNumber, status: 'ISSUED' }, { $set: { status: 'VOID' } });
      return res.modifiedCount;
    },
  };
}

module.exports = { createInvoiceRepository };
