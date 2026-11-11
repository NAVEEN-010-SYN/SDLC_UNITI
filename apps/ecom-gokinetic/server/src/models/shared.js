'use strict';

const mongoose = require('mongoose');

/** Sub-schemas reused across collections. */

const moneyField = (opts = {}) => ({
  type: Number,
  required: opts.required !== false,
  default: opts.default ?? 0,
  min: opts.allowNegative ? undefined : 0,
  validate: { validator: Number.isSafeInteger, message: 'Money must be integer minor units.' },
});

const addressSchema = new mongoose.Schema(
  {
    line1: { type: String, required: true, trim: true },
    line2: { type: String, trim: true, default: '' },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, uppercase: true, minlength: 2, maxlength: 2 },
    postalCode: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const statusHistorySchema = new mongoose.Schema(
  {
    from: { type: String },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actor: { type: String, default: 'system' },
    reason: { type: String, default: null },
  },
  { _id: false },
);

/** Serialises documents to API shape: `id` instead of `_id`, no `__v`. */
function applyToJSON(schema) {
  schema.set('toJSON', {
    virtuals: true,
    versionKey: false,
    transform: (_doc, ret) => {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  });
}

module.exports = { moneyField, addressSchema, statusHistorySchema, applyToJSON };
