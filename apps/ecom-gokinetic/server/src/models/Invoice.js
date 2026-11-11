'use strict';

const mongoose = require('mongoose');
const { moneyField, applyToJSON } = require('./shared');
const { INVOICE_KINDS, INVOICE_STATUS } = require('../domain/billing');

const invoiceLineSchema = new mongoose.Schema(
  {
    sku: { type: String, default: null },
    description: { type: String, required: true },
    amount: moneyField({ allowNegative: true }),
  },
  { _id: false },
);

/**
 * Customer invoice for an order: one INITIAL invoice for the checkout charges
 * and one RECURRING invoice per calendar month while the service is active.
 */
const invoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    orderNumber: { type: String, required: true, index: true },
    kind: { type: String, enum: Object.values(INVOICE_KINDS), required: true },
    status: { type: String, enum: Object.values(INVOICE_STATUS), default: INVOICE_STATUS.ISSUED },
    currency: { type: String, default: 'USD' },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    prorated: { type: Boolean, default: false },
    lines: { type: [invoiceLineSchema], default: [] },
    subtotal: moneyField({ allowNegative: true }),
    tax: moneyField(),
    total: moneyField({ allowNegative: true }),
    issuedAt: { type: Date, required: true },
    dueAt: { type: Date, required: true },
    paidAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// One invoice per order per period (periodStart is null for INITIAL), which
// makes the billing job safe to re-run.
invoiceSchema.index({ orderNumber: 1, kind: 1, periodStart: 1 }, { unique: true });
invoiceSchema.index({ accountId: 1, issuedAt: -1 });

applyToJSON(invoiceSchema);

module.exports = mongoose.models.Invoice || mongoose.model('Invoice', invoiceSchema);
