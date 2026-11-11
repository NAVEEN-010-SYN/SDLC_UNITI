'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, applyToJSON } = require('./shared');
const { SEGMENTS, PRODUCT_TYPES } = require('../domain/constants');

const cartItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, enum: Object.values(PRODUCT_TYPES), required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const serviceabilitySnapshotSchema = new mongoose.Schema(
  {
    checkId: { type: String },
    serviceable: { type: Boolean },
    maxSpeedMbps: { type: Number },
    availablePlanSkus: { type: [String], default: [] },
    checkedAt: { type: Date },
  },
  { _id: false },
);

/**
 * Shopping cart. Guest carts are identified by `guestToken`; once a shopper
 * logs in the cart is claimed by setting `userId`/`accountId`.
 */
const cartSchema = new mongoose.Schema(
  {
    userId: { type: String, index: true, default: null },
    accountId: { type: String, index: true, default: null },
    guestToken: { type: String, index: true, default: null },
    segment: { type: String, enum: Object.values(SEGMENTS), default: SEGMENTS.CONSUMER },
    items: { type: [cartItemSchema], default: [] },
    contractTermMonths: { type: Number, default: 12 },
    serviceAddress: { type: addressSchema, default: null },
    serviceability: { type: serviceabilitySnapshotSchema, default: null },
    promoCode: { type: String, default: null },
    status: { type: String, enum: ['OPEN', 'CHECKED_OUT', 'ABANDONED'], default: 'OPEN', index: true },
    reminderSentAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true },
    version: { type: Number, default: 0 },
  },
  { timestamps: true },
);

cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

applyToJSON(cartSchema);

module.exports = mongoose.models.Cart || mongoose.model('Cart', cartSchema);
