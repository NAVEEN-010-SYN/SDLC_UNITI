'use strict';

const crypto = require('node:crypto');

/**
 * Human-facing identifiers. Account ids follow the platform format
 * `ACC-########`; order and quote numbers embed the UTC date so support agents
 * can triage them at a glance.
 */

const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O/1/I to avoid misreads

function randomCode(length) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

function datePart(date = new Date()) {
  return date.toISOString().slice(0, 10).replace(/-/g, '');
}

/** @returns {string} e.g. ACC-04821937 */
function formatAccountId(sequence) {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 99999999) {
    throw new RangeError('Account sequence out of range');
  }
  return `ACC-${String(sequence).padStart(8, '0')}`;
}

function isAccountId(value) {
  return /^ACC-\d{8}$/.test(String(value));
}

/** @returns {string} e.g. GK-20261111-7HQ2XK */
function generateOrderNumber(date) {
  return `GK-${datePart(date)}-${randomCode(6)}`;
}

/** @returns {string} e.g. QTE-20261111-K3M9 */
function generateQuoteNumber(date) {
  return `QTE-${datePart(date)}-${randomCode(4)}`;
}

function generateCorrelationId() {
  return crypto.randomUUID();
}

module.exports = {
  formatAccountId,
  isAccountId,
  generateOrderNumber,
  generateQuoteNumber,
  generateCorrelationId,
  randomCode,
};
