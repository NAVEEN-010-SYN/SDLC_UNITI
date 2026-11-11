'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, statusHistorySchema, applyToJSON } = require('./shared');
const { QUOTE_STATUS } = require('../domain/constants');

const quoteItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
  },
  { _id: false },
);

const siteSchema = new mongoose.Schema(
  {
    address: { type: addressSchema, required: true },
    serviceable: { type: Boolean, default: null },
    maxSpeedMbps: { type: Number, default: null },
    checkId: { type: String, default: null },
  },
  { _id: false },
);

/** Business GoKinetic multi-site quote. */
const quoteSchema = new mongoose.Schema(
  {
    quoteNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    requestedBy: { type: String, required: true },
    companyName: { type: String, required: true },
    contactEmail: { type: String, required: true },
    contactPhone: { type: String },
    items: { type: [quoteItemSchema], required: true },
    sites: { type: [siteSchema], required: true },
    contractTermMonths: { type: Number, required: true },
    negotiatedDiscountBps: { type: Number, default: 0 },
    requiresApproval: { type: Boolean, default: false },
    pricedBy: { type: String, default: null },
    approvedBy: { type: String, default: null },
    pricing: { type: mongoose.Schema.Types.Mixed, default: null },
    status: { type: String, enum: Object.values(QUOTE_STATUS), default: QUOTE_STATUS.REQUESTED, index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    validUntil: { type: Date, default: null },
    notes: { type: String },
    internalNotes: { type: [String], default: [] },
    poNumber: { type: String, default: null },
    convertedOrderNumbers: { type: [String], default: [] },
    revision: { type: Number, default: 0 },
  },
  { timestamps: true },
);

quoteSchema.index({ status: 1, validUntil: 1 });

applyToJSON(quoteSchema);
quoteSchema.set('toJSON', {
  ...quoteSchema.get('toJSON'),
  transform: (doc, ret) => {
    ret.id = String(ret._id);
    delete ret._id;
    delete ret.internalNotes;
    return ret;
  },
});

module.exports = mongoose.models.Quote || mongoose.model('Quote', quoteSchema);
