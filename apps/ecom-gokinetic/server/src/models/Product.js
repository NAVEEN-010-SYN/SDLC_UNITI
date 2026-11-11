'use strict';

const mongoose = require('mongoose');
const { moneyField, applyToJSON } = require('./shared');
const { PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');

/**
 * Catalogue item: a fibre plan, an add-on (e.g. Whole-Home Wi-Fi, static IP,
 * voice line) or hardware (router, mesh extender). Prices are minor units.
 */
const productSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    type: { type: String, enum: Object.values(PRODUCT_TYPES), required: true, index: true },
    segments: { type: [String], enum: Object.values(SEGMENTS), required: true, index: true },
    speedMbps: { type: Number },
    uploadMbps: { type: Number },
    technology: { type: String, enum: ['FTTP', 'FTTC', 'FIXED_WIRELESS'], default: 'FTTP' },
    monthlyPrice: moneyField(),
    oneTimePrice: moneyField(),
    installationFee: moneyField(),
    currency: { type: String, default: 'USD' },
    requiresPlan: { type: Boolean, default: false },
    compatiblePlanSkus: { type: [String], default: [] },
    maxQuantity: { type: Number, default: 1, min: 1 },
    stockOnHand: { type: Number, min: 0 },
    features: { type: [String], default: [] },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 100 },
  },
  { timestamps: true },
);

productSchema.index({ name: 'text', description: 'text' });
productSchema.index({ type: 1, active: 1, monthlyPrice: 1 });

applyToJSON(productSchema);

module.exports = mongoose.models.Product || mongoose.model('Product', productSchema);
