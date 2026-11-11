'use strict';

const mongoose = require('mongoose');
const { applyToJSON } = require('./shared');
const { PROMO_KINDS, PROMO_SCOPES, SEGMENTS } = require('../domain/constants');

const promoCodeSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, default: '' },
    kind: { type: String, enum: Object.values(PROMO_KINDS), required: true },
    scope: { type: String, enum: Object.values(PROMO_SCOPES), default: PROMO_SCOPES.ALL },
    valueBps: { type: Number },
    valueAmount: { type: Number },
    freeMonths: { type: Number },
    maxDiscountAmount: { type: Number },
    durationMonths: { type: Number },
    segments: { type: [String], enum: Object.values(SEGMENTS), default: [] },
    eligibleSkus: { type: [String], default: [] },
    minMonthlySpend: { type: Number },
    minContractTermMonths: { type: Number },
    maxRedemptions: { type: Number },
    redemptionCount: { type: Number, default: 0 },
    perAccountLimit: { type: Number, default: 1 },
    newCustomersOnly: { type: Boolean, default: false },
    startsAt: { type: Date },
    endsAt: { type: Date },
    active: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

applyToJSON(promoCodeSchema);

const promoRedemptionSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    accountId: { type: String, required: true },
    orderNumber: { type: String, required: true, unique: true },
    discountValue: { type: Number, required: true },
    reversedAt: { type: Date, default: null },
  },
  { timestamps: true },
);
promoRedemptionSchema.index({ code: 1, accountId: 1 });

const PromoCode = mongoose.models.PromoCode || mongoose.model('PromoCode', promoCodeSchema);
const PromoRedemption =
  mongoose.models.PromoRedemption || mongoose.model('PromoRedemption', promoRedemptionSchema);

module.exports = { PromoCode, PromoRedemption };
