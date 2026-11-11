'use strict';

const crypto = require('node:crypto');

/**
 * US postal address normalisation used for serviceability lookups and cache
 * keys. The upstream serviceability API is sensitive to abbreviations, so the
 * storefront normalises before calling it and before caching results.
 */

const STREET_SUFFIXES = Object.freeze({
  AVENUE: 'AVE',
  BOULEVARD: 'BLVD',
  CIRCLE: 'CIR',
  COURT: 'CT',
  DRIVE: 'DR',
  HIGHWAY: 'HWY',
  LANE: 'LN',
  PARKWAY: 'PKWY',
  PLACE: 'PL',
  ROAD: 'RD',
  STREET: 'ST',
  TERRACE: 'TER',
  TRAIL: 'TRL',
});

const DIRECTIONALS = Object.freeze({
  NORTH: 'N',
  SOUTH: 'S',
  EAST: 'E',
  WEST: 'W',
  NORTHEAST: 'NE',
  NORTHWEST: 'NW',
  SOUTHEAST: 'SE',
  SOUTHWEST: 'SW',
});

const UNIT_DESIGNATORS = Object.freeze({
  APARTMENT: 'APT',
  SUITE: 'STE',
  UNIT: 'UNIT',
  BUILDING: 'BLDG',
  FLOOR: 'FL',
});

const US_STATES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM',
  'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA',
  'WV', 'WI', 'WY',
]);

function normaliseToken(token) {
  const upper = token.toUpperCase().replace(/[.,#]/g, '');
  return STREET_SUFFIXES[upper] || DIRECTIONALS[upper] || UNIT_DESIGNATORS[upper] || upper;
}

function normaliseLine(line) {
  if (!line) return '';
  return line
    .trim()
    .split(/\s+/)
    .map(normaliseToken)
    .filter(Boolean)
    .join(' ');
}

/**
 * @param {{line1: string, line2?: string, city: string, state: string, postalCode: string}} address
 * @returns {{line1: string, line2: string, city: string, state: string, postalCode: string}}
 */
function normalizeAddress(address) {
  const postal = String(address.postalCode || '').trim();
  return {
    line1: normaliseLine(address.line1),
    line2: normaliseLine(address.line2),
    city: String(address.city || '').trim().toUpperCase().replace(/\s+/g, ' '),
    state: String(address.state || '').trim().toUpperCase(),
    postalCode: postal.slice(0, 5),
  };
}

/**
 * Validates a raw address; returns field errors in the shared format.
 */
function validateAddress(address, prefix = 'address') {
  const errors = [];
  if (!address || typeof address !== 'object') {
    return [{ path: prefix, message: 'Address is required.' }];
  }
  if (!address.line1 || String(address.line1).trim().length < 3) {
    errors.push({ path: `${prefix}.line1`, message: 'Street address is required.' });
  }
  if (!address.city || String(address.city).trim().length < 2) {
    errors.push({ path: `${prefix}.city`, message: 'City is required.' });
  }
  if (!US_STATES.has(String(address.state || '').toUpperCase())) {
    errors.push({ path: `${prefix}.state`, message: 'State must be a valid two-letter US state code.' });
  }
  if (!/^\d{5}(-\d{4})?$/.test(String(address.postalCode || '').trim())) {
    errors.push({ path: `${prefix}.postalCode`, message: 'ZIP code must be 5 digits or ZIP+4.' });
  }
  return errors;
}

/** Stable hash of the normalised address, used as a cache key. */
function addressKey(address) {
  const n = normalizeAddress(address);
  const canonical = [n.line1, n.line2, n.city, n.state, n.postalCode].join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

/** Single-line rendering for emails and the order summary. */
function formatAddress(address) {
  const parts = [address.line1, address.line2, `${address.city}, ${address.state} ${address.postalCode}`];
  return parts.filter(Boolean).join(', ');
}

module.exports = { normalizeAddress, validateAddress, addressKey, formatAddress, US_STATES };
