'use strict';

const Cart = require('../models/Cart');
const { toPlain } = require('./pagination');

/**
 * Cart persistence with optimistic concurrency: every mutation must present
 * the version it read, so two browser tabs cannot silently overwrite each
 * other's changes.
 */
function createCartRepository({ model = Cart } = {}) {
  return {
    async create(cart) {
      const doc = await model.create(cart);
      return toPlain(doc.toObject());
    },

    async findById(cartId) {
      return toPlain(await model.findById(cartId).lean());
    },

    async findOpenByUser(userId) {
      return toPlain(
        await model.findOne({ userId, status: 'OPEN' }).sort({ updatedAt: -1 }).lean(),
      );
    },

    /**
     * Applies `patch` only if the stored version matches `expectedVersion`.
     * @returns {Promise<object|null>} updated cart, or null on version conflict
     */
    async updateVersioned(cartId, expectedVersion, patch) {
      const doc = await model
        .findOneAndUpdate(
          { _id: cartId, version: expectedVersion, status: 'OPEN' },
          { $set: patch, $inc: { version: 1 } },
          { new: true, runValidators: true },
        )
        .lean();
      return toPlain(doc);
    },

    async markCheckedOut(cartId) {
      await model.updateOne({ _id: cartId }, { $set: { status: 'CHECKED_OUT' }, $inc: { version: 1 } });
    },

    /**
     * Open carts with items, owned by a known user, idle since `idleSince`
     * and not yet reminded.
     */
    async findAbandoned({ idleSince, limit = 200 }) {
      const docs = await model
        .find({
          status: 'OPEN',
          userId: { $ne: null },
          'items.0': { $exists: true },
          updatedAt: { $lte: idleSince },
          reminderSentAt: null,
        })
        .limit(limit)
        .lean();
      return docs.map(toPlain);
    },

    async markReminderSent(cartId, at = new Date()) {
      await model.updateOne({ _id: cartId }, { $set: { reminderSentAt: at } });
    },

    async expireStale(now = new Date()) {
      const res = await model.updateMany(
        { status: 'OPEN', expiresAt: { $lte: now } },
        { $set: { status: 'ABANDONED' } },
      );
      return res.modifiedCount;
    },
  };
}

module.exports = { createCartRepository };
