'use strict';

const mongoose = require('mongoose');
const { addressSchema, applyToJSON } = require('./shared');
const { SEGMENTS } = require('../domain/constants');

const savedAddressSchema = new mongoose.Schema({
  label: { type: String, required: true, trim: true },
  address: { type: addressSchema, required: true },
  isDefault: { type: Boolean, default: false },
  serviceable: { type: Boolean, default: null },
});

const accountSchema = new mongoose.Schema(
  {
    accountId: { type: String, required: true, unique: true, match: /^ACC-\d{8}$/ },
    segment: { type: String, enum: Object.values(SEGMENTS), required: true },
    displayName: { type: String, required: true, trim: true },
    businessName: { type: String, trim: true },
    taxExempt: { type: Boolean, default: false },
    creditTermsDays: { type: Number, default: 0 },
    addresses: { type: [savedAddressSchema], default: [] },
    existingCustomer: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'CLOSED'], default: 'ACTIVE' },
  },
  { timestamps: true },
);

applyToJSON(accountSchema);

module.exports = mongoose.models.Account || mongoose.model('Account', accountSchema);
