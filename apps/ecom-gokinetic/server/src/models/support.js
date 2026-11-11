'use strict';

const mongoose = require('mongoose');
const { addressSchema } = require('./shared');

/**
 * Supporting collections that are infrastructure rather than domain
 * aggregates: sequence counters, serviceability cache, idempotency records,
 * refresh-token sessions and outbound email log.
 */

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const serviceabilityCheckSchema = new mongoose.Schema(
  {
    addressKey: { type: String, required: true, index: true },
    address: { type: addressSchema, required: true },
    checkId: { type: String, required: true, unique: true },
    serviceable: { type: Boolean, required: true },
    technology: { type: String, default: null },
    maxDownloadMbps: { type: Number, default: 0 },
    maxUploadMbps: { type: Number, default: 0 },
    estimatedInstallDays: { type: Number, default: null },
    requiresSiteSurvey: { type: Boolean, default: false },
    reasonCode: { type: String, default: null },
    upstreamReference: { type: String, default: null },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
serviceabilityCheckSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const idempotencyRecordSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    scope: { type: String, required: true },
    requestHash: { type: String, required: true },
    state: { type: String, enum: ['IN_PROGRESS', 'COMPLETED'], default: 'IN_PROGRESS' },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);
idempotencyRecordSchema.index({ key: 1, scope: 1 }, { unique: true });
idempotencyRecordSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const sessionSchema = new mongoose.Schema(
  {
    jti: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    familyId: { type: String, required: true, index: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String },
  },
  { timestamps: true },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const emailLogSchema = new mongoose.Schema(
  {
    template: { type: String, required: true },
    to: { type: String, required: true },
    reference: { type: String, index: true },
    providerMessageId: { type: String },
    status: { type: String, enum: ['SENT', 'FAILED'], required: true },
    error: { type: String },
  },
  { timestamps: true },
);

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

module.exports = {
  Counter: model('Counter', counterSchema),
  ServiceabilityCheck: model('ServiceabilityCheck', serviceabilityCheckSchema),
  IdempotencyRecord: model('IdempotencyRecord', idempotencyRecordSchema),
  Session: model('Session', sessionSchema),
  EmailLog: model('EmailLog', emailLogSchema),
};
