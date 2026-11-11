'use strict';

const User = require('../models/User');
const Account = require('../models/Account');
const { Counter, Session } = require('../models/support');
const { toPlain } = require('./pagination');

/** Users, accounts and refresh-token sessions. */

function createUserRepository({ model = User } = {}) {
  return {
    async create(user) {
      const doc = await model.create(user);
      return doc.toObject();
    },
    /** Includes the password hash: for authentication only. */
    async findByEmailWithSecret(email) {
      return model.findOne({ email: email.toLowerCase() }).lean();
    },
    async findById(id) {
      return toPlain(await model.findById(id).lean());
    },
    async findByIdWithSecret(id) {
      return model.findById(id).lean();
    },
    async update(id, patch) {
      return toPlain(await model.findByIdAndUpdate(id, { $set: patch }, { new: true, runValidators: true }).lean());
    },
    async listByAccount(accountId) {
      const docs = await model.find({ accountId }).sort({ createdAt: 1 }).lean();
      return docs.map(toPlain);
    },
    async recordLoginFailure(id, { lockThreshold, lockMinutes, now = new Date() }) {
      const doc = await model.findByIdAndUpdate(id, { $inc: { failedLoginCount: 1 } }, { new: true }).lean();
      if (doc && doc.failedLoginCount >= lockThreshold) {
        await model.updateOne(
          { _id: id },
          { $set: { lockedUntil: new Date(now.getTime() + lockMinutes * 60000), failedLoginCount: 0 } },
        );
      }
    },
    async recordLoginSuccess(id, now = new Date()) {
      await model.updateOne({ _id: id }, { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
    },
  };
}

function createAccountRepository({ model = Account, counterModel = Counter } = {}) {
  return {
    async nextSequence(name = 'account') {
      const doc = await counterModel
        .findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true })
        .lean();
      return doc.seq;
    },
    async create(account) {
      const doc = await model.create(account);
      return toPlain(doc.toObject());
    },
    async findByAccountId(accountId) {
      return toPlain(await model.findOne({ accountId }).lean());
    },
    async update(accountId, patch) {
      return toPlain(await model.findOneAndUpdate({ accountId }, { $set: patch }, { new: true }).lean());
    },
    async addAddress(accountId, entry) {
      if (entry.isDefault) {
        await model.updateOne({ accountId }, { $set: { 'addresses.$[].isDefault': false } });
      }
      return toPlain(
        await model.findOneAndUpdate({ accountId }, { $push: { addresses: entry } }, { new: true }).lean(),
      );
    },
    async removeAddress(accountId, addressId) {
      return toPlain(
        await model
          .findOneAndUpdate({ accountId }, { $pull: { addresses: { _id: addressId } } }, { new: true })
          .lean(),
      );
    },
  };
}

function createSessionRepository({ model = Session } = {}) {
  return {
    async create(session) {
      await model.create(session);
    },
    async findByJti(jti) {
      return model.findOne({ jti }).lean();
    },
    /** Marks a refresh token as used and records its successor. */
    async rotate(jti, replacedBy) {
      const res = await model.updateOne(
        { jti, revokedAt: null },
        { $set: { revokedAt: new Date(), replacedBy } },
      );
      return res.modifiedCount === 1;
    },
    /** Revokes an entire token family (refresh-token reuse detected / logout). */
    async revokeFamily(familyId) {
      await model.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },
    async revokeAllForUser(userId) {
      await model.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    },
  };
}

module.exports = { createUserRepository, createAccountRepository, createSessionRepository };
