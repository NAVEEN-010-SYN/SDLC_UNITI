'use strict';

const mongoose = require('mongoose');
const { applyToJSON } = require('./shared');
const { ROLES, SEGMENTS } = require('../domain/constants');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    accountId: { type: String, required: true, index: true },
    roles: { type: [String], enum: Object.values(ROLES), default: [ROLES.CONSUMER] },
    segment: { type: String, enum: Object.values(SEGMENTS), default: SEGMENTS.CONSUMER },
    marketingOptIn: { type: Boolean, default: false },
    status: { type: String, enum: ['ACTIVE', 'INVITED', 'LOCKED', 'DISABLED'], default: 'ACTIVE' },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
  },
  { timestamps: true },
);

applyToJSON(userSchema);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
