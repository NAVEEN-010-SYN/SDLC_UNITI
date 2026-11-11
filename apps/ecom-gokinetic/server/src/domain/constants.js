'use strict';

/** Roles from the platform-wide domain vocabulary (CONVENTIONS.md). */
const ROLES = Object.freeze({
  CONSUMER: 'CONSUMER',
  BUSINESS_ADMIN: 'BUSINESS_ADMIN',
  BUSINESS_USER: 'BUSINESS_USER',
  PARTNER_ADMIN: 'PARTNER_ADMIN',
  PARTNER_AGENT: 'PARTNER_AGENT',
  WHOLESALE_BUYER: 'WHOLESALE_BUYER',
  SUPPORT_AGENT: 'SUPPORT_AGENT',
});

const BUSINESS_ROLES = Object.freeze([ROLES.BUSINESS_ADMIN, ROLES.BUSINESS_USER]);
const STAFF_ROLES = Object.freeze([ROLES.SUPPORT_AGENT]);

/** Storefront brands served by this app. */
const SEGMENTS = Object.freeze({
  CONSUMER: 'CONSUMER',
  BUSINESS: 'BUSINESS',
});

const PRODUCT_TYPES = Object.freeze({
  PLAN: 'PLAN',
  ADDON: 'ADDON',
  HARDWARE: 'HARDWARE',
});

const ORDER_STATUS = Object.freeze({
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  VALIDATED: 'VALIDATED',
  PROVISIONING: 'PROVISIONING',
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  FAILED: 'FAILED',
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: 'PENDING',
  AUTHORIZED: 'AUTHORIZED',
  CAPTURED: 'CAPTURED',
  VOIDED: 'VOIDED',
  REFUNDED: 'REFUNDED',
  FAILED: 'FAILED',
  NOT_REQUIRED: 'NOT_REQUIRED',
});

const QUOTE_STATUS = Object.freeze({
  REQUESTED: 'REQUESTED',
  PRICED: 'PRICED',
  PENDING_APPROVAL: 'PENDING_APPROVAL',
  SENT: 'SENT',
  ACCEPTED: 'ACCEPTED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  CONVERTED: 'CONVERTED',
});

const PROMO_KINDS = Object.freeze({
  PERCENT_OFF: 'PERCENT_OFF',
  FIXED_OFF: 'FIXED_OFF',
  FREE_INSTALLATION: 'FREE_INSTALLATION',
  FREE_MONTHS: 'FREE_MONTHS',
});

const PROMO_SCOPES = Object.freeze({
  RECURRING: 'RECURRING',
  ONE_TIME: 'ONE_TIME',
  ALL: 'ALL',
});

/** Contract terms offered and the recurring discount (in bps) each earns. */
const CONTRACT_TERMS = Object.freeze({
  0: { discountBps: 0, waivesInstallation: false },
  12: { discountBps: 0, waivesInstallation: true },
  24: { discountBps: 500, waivesInstallation: true },
  36: { discountBps: 1000, waivesInstallation: true },
});

/**
 * Sales tax rates by US state, basis points. Telecom taxes are far more nuanced
 * in practice; this table drives the storefront estimate shown before checkout.
 */
const STATE_TAX_BPS = Object.freeze({
  AL: 400,
  AR: 650,
  GA: 400,
  IA: 600,
  KY: 600,
  MN: 688,
  MS: 700,
  NC: 475,
  NE: 550,
  NM: 513,
  NY: 400,
  OH: 575,
  PA: 600,
  SC: 600,
  TX: 625,
});

const DEFAULT_TAX_BPS = 0;

module.exports = {
  ROLES,
  BUSINESS_ROLES,
  STAFF_ROLES,
  SEGMENTS,
  PRODUCT_TYPES,
  ORDER_STATUS,
  PAYMENT_STATUS,
  QUOTE_STATUS,
  PROMO_KINDS,
  PROMO_SCOPES,
  CONTRACT_TERMS,
  STATE_TAX_BPS,
  DEFAULT_TAX_BPS,
};
