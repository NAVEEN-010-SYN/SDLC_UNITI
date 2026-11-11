'use strict';

const mongoose = require('mongoose');
const { addressSchema, moneyField, statusHistorySchema, applyToJSON } = require('./shared');
const { ORDER_STATUS, PAYMENT_STATUS, SEGMENTS, PRODUCT_TYPES } = require('../domain/constants');

const orderItemSchema = new mongoose.Schema(
  {
    sku: { type: String, required: true },
    name: { type: String, required: true },
    productType: { type: String, enum: Object.values(PRODUCT_TYPES), required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitMonthly: moneyField(),
    unitOneTime: moneyField(),
    unitInstallation: moneyField(),
  },
  { _id: false },
);

const paymentSchema = new mongoose.Schema(
  {
    status: { type: String, enum: Object.values(PAYMENT_STATUS), default: PAYMENT_STATUS.PENDING },
    gatewayReference: { type: String, default: null },
    authorizedAmount: moneyField(),
    capturedAmount: moneyField(),
    refundedAmount: moneyField(),
    last4: { type: String, default: null },
    brand: { type: String, default: null },
    failureCode: { type: String, default: null },
  },
  { _id: false },
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    accountId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    segment: { type: String, enum: Object.values(SEGMENTS), required: true },
    status: { type: String, enum: Object.values(ORDER_STATUS), default: ORDER_STATUS.DRAFT, index: true },
    statusHistory: { type: [statusHistorySchema], default: [] },
    items: { type: [orderItemSchema], required: true },
    contractTermMonths: { type: Number, required: true },
    serviceAddress: { type: addressSchema, required: true },
    billingAddress: { type: addressSchema, required: true },
    contact: {
      email: { type: String, required: true },
      phone: { type: String, required: true },
      firstName: { type: String, required: true },
      lastName: { type: String, required: true },
    },
    promoCode: { type: String, default: null },
    pricing: { type: mongoose.Schema.Types.Mixed, required: true },
    currency: { type: String, default: 'USD' },
    dueToday: moneyField(),
    monthlyRecurring: moneyField(),
    payment: { type: paymentSchema, default: () => ({}) },
    preferredInstallDate: { type: Date, default: null },
    installAppointment: { type: Date, default: null },
    serviceabilityCheckId: { type: String, default: null },
    sourceQuoteNumber: { type: String, default: null },
    cartId: { type: String, default: null },
    failureReason: { type: String, default: null },
    cancellationReason: { type: String, default: null },
    submittedAt: { type: Date, default: null },
    activatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

orderSchema.index({ accountId: 1, createdAt: -1 });
orderSchema.index({ status: 1, updatedAt: 1 });

applyToJSON(orderSchema);

module.exports = mongoose.models.Order || mongoose.model('Order', orderSchema);
