'use strict';

const { ServiceabilityCheck, IdempotencyRecord, EmailLog } = require('../models/support');
const { toPlain } = require('./pagination');

/** Serviceability cache, idempotency records and email audit log. */

function createServiceabilityRepository({ model = ServiceabilityCheck } = {}) {
  return {
    async findFresh(addressKey, now = new Date()) {
      return toPlain(
        await model.findOne({ addressKey, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean(),
      );
    },
    async findByCheckId(checkId) {
      return toPlain(await model.findOne({ checkId }).lean());
    },
    async save(check) {
      const doc = await model.create(check);
      return toPlain(doc.toObject());
    },
  };
}

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;

function createIdempotencyRepository({ model = IdempotencyRecord, now = () => new Date() } = {}) {
  return {
    /**
     * Inserts an IN_PROGRESS marker. Returns the existing record when the key
     * was already used, or null when this request now owns the key.
     */
    async begin({ key, scope, requestHash }) {
      try {
        await model.create({
          key,
          scope,
          requestHash,
          state: 'IN_PROGRESS',
          expiresAt: new Date(now().getTime() + IDEMPOTENCY_TTL_MS),
        });
        return null;
      } catch (err) {
        if (err && err.code === 11000) {
          return model.findOne({ key, scope }).lean();
        }
        throw err;
      }
    },
    async complete({ key, scope, responseStatus, responseBody }) {
      await model.updateOne(
        { key, scope },
        { $set: { state: 'COMPLETED', responseStatus, responseBody } },
      );
    },
    async release({ key, scope }) {
      await model.deleteOne({ key, scope, state: 'IN_PROGRESS' });
    },
  };
}

function createEmailLogRepository({ model = EmailLog } = {}) {
  return {
    async record(entry) {
      await model.create(entry);
    },
    async wasSent(template, reference) {
      return Boolean(await model.exists({ template, reference, status: 'SENT' }));
    },
  };
}

module.exports = {
  createServiceabilityRepository,
  createIdempotencyRepository,
  createEmailLogRepository,
};
