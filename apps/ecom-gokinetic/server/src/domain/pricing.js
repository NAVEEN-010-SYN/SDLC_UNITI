'use strict';

/**
 * Pricing engine for carts, orders and quotes.
 *
 * Pure functions only: callers pass in catalogue prices, the promo descriptor
 * and the tax rate; nothing here touches the database. All arithmetic is in
 * integer minor units.
 *
 * Calculation order (per line, then aggregated):
 *   1. list price           unit price x quantity
 *   2. contract-term discount   PLAN lines only, by term length
 *   3. business volume discount PLAN lines only, BUSINESS segment, by total sites
 *   4. promotion            per promo kind/scope, spread across eligible lines
 *   5. tax                  per line on the post-discount amount
 */

const { applyBps } = require('./money');
const { CONTRACT_TERMS, PRODUCT_TYPES, SEGMENTS } = require('./constants');
const { applyPromo } = require('./promoPricing');

/** Multi-site volume tiers for Business GoKinetic, ordered descending. */
const VOLUME_TIERS = Object.freeze([
  { minSites: 25, discountBps: 1500 },
  { minSites: 10, discountBps: 1000 },
  { minSites: 5, discountBps: 500 },
]);

/**
 * @typedef {object} PricingLineInput
 * @property {string} sku
 * @property {string} productType PLAN | ADDON | HARDWARE
 * @property {number} quantity
 * @property {number} unitMonthly      recurring price per unit (minor units)
 * @property {number} unitOneTime      one-off purchase price per unit
 * @property {number} unitInstallation installation fee per unit
 */

/**
 * @typedef {object} PromoDescriptor
 * @property {string} code
 * @property {string} kind  see PROMO_KINDS
 * @property {string} [scope] see PROMO_SCOPES (default ALL)
 * @property {number} [valueBps]     for PERCENT_OFF
 * @property {number} [valueAmount]  for FIXED_OFF
 * @property {number} [freeMonths]   for FREE_MONTHS
 * @property {number} [maxDiscountAmount] cap for PERCENT_OFF
 * @property {number} [durationMonths] how long a recurring discount applies
 * @property {string[]} [eligibleSkus] restrict to these SKUs
 */

function resolveTerm(contractTermMonths) {
  const term = CONTRACT_TERMS[contractTermMonths];
  if (!term) {
    throw new RangeError(`Unsupported contract term ${contractTermMonths} months`);
  }
  return term;
}

/**
 * Returns the volume discount (bps) earned by the number of plan sites.
 * @param {number} siteCount
 */
function volumeDiscountBps(siteCount) {
  const tier = VOLUME_TIERS.find((t) => siteCount >= t.minSites);
  return tier ? tier.discountBps : 0;
}

function validateLine(line) {
  if (!line.sku) throw new TypeError('Pricing line requires a sku');
  if (!Number.isSafeInteger(line.quantity) || line.quantity < 1) {
    throw new RangeError(`Line ${line.sku} has an invalid quantity`);
  }
  for (const key of ['unitMonthly', 'unitOneTime', 'unitInstallation']) {
    const value = line[key] ?? 0;
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`Line ${line.sku} has an invalid ${key}`);
    }
  }
}

/** Step 1-3: list prices and structural discounts for one line. */
function priceLineBase(line, { term, volumeBps, segment }) {
  const quantity = line.quantity;
  const monthlyList = (line.unitMonthly || 0) * quantity;
  const isPlan = line.productType === PRODUCT_TYPES.PLAN;

  const termDiscount = isPlan ? applyBps({ amount: monthlyList, currency: 'USD' }, term.discountBps).amount : 0;
  const afterTerm = monthlyList - termDiscount;
  let volumeDiscount = 0;
  if (isPlan && segment === SEGMENTS.BUSINESS) {
    volumeDiscount = applyBps({ amount: afterTerm, currency: 'USD' }, volumeBps).amount;
  }

  const installationList = (line.unitInstallation || 0) * quantity;
  const installationWaived = term.waivesInstallation ? installationList : 0;

  return {
    sku: line.sku,
    productType: line.productType,
    quantity,
    monthlyList,
    termDiscount,
    volumeDiscount,
    monthlyNet: afterTerm - volumeDiscount,
    hardware: (line.unitOneTime || 0) * quantity,
    installationList,
    installationWaived,
    installationNet: installationList - installationWaived,
    recurringPromo: 0,
    oneTimePromo: 0,
    introCredit: 0,
  };
}

/** Step 5: per-line tax. */
function applyTax(lines, taxBps) {
  for (const line of lines) {
    line.recurringTaxable = line.monthlyNet - line.recurringPromo;
    line.oneTimeTaxable = line.hardware + line.installationNet - line.oneTimePromo;
    line.recurringTax = applyBps({ amount: line.recurringTaxable, currency: 'USD' }, taxBps).amount;
    line.oneTimeTax = applyBps({ amount: line.oneTimeTaxable, currency: 'USD' }, taxBps).amount;
    line.introCreditTax = applyBps({ amount: line.introCredit, currency: 'USD' }, taxBps).amount;
  }
}

const total = (lines, key) => lines.reduce((acc, line) => acc + line[key], 0);

/** Number of plan sites, used for the business volume tier. */
function countPlanSites(lines) {
  let count = 0;
  for (const line of lines) {
    if (line.productType === PRODUCT_TYPES.PLAN) count += line.quantity;
  }
  return count;
}

/** B2B quote-only extra recurring discount, applied after structural discounts. */
function applyNegotiatedDiscount(priced, negotiatedDiscountBps, currency) {
  if (negotiatedDiscountBps <= 0) return;
  for (const line of priced) {
    const extra = applyBps({ amount: line.monthlyNet, currency }, negotiatedDiscountBps).amount;
    line.negotiatedDiscount = extra;
    line.monthlyNet -= extra;
  }
}

function summarizeRecurring(priced) {
  const recurring = {
    subtotal: total(priced, 'monthlyList'),
    termDiscount: total(priced, 'termDiscount'),
    volumeDiscount: total(priced, 'volumeDiscount'),
    negotiatedDiscount: priced.reduce((a, l) => a + (l.negotiatedDiscount || 0), 0),
    promoDiscount: total(priced, 'recurringPromo'),
    taxable: total(priced, 'recurringTaxable'),
    tax: total(priced, 'recurringTax'),
  };
  recurring.total = recurring.taxable + recurring.tax;
  return recurring;
}

function summarizeOneTime(priced) {
  const oneTime = {
    hardware: total(priced, 'hardware'),
    installation: total(priced, 'installationList'),
    installationWaived: total(priced, 'installationWaived'),
    promoDiscount: total(priced, 'oneTimePromo'),
    taxable: total(priced, 'oneTimeTaxable'),
    tax: total(priced, 'oneTimeTax'),
  };
  oneTime.total = oneTime.taxable + oneTime.tax;
  return oneTime;
}

function toOutputLine(l) {
  return {
    sku: l.sku,
    productType: l.productType,
    quantity: l.quantity,
    monthlyList: l.monthlyList,
    monthlyNet: l.recurringTaxable,
    oneTimeNet: l.oneTimeTaxable,
    tax: l.recurringTax + l.oneTimeTax,
  };
}

/**
 * Prices a set of lines.
 * @param {object} input
 * @param {PricingLineInput[]} input.lines
 * @param {number} [input.contractTermMonths=0]
 * @param {string} [input.segment=CONSUMER]
 * @param {PromoDescriptor|null} [input.promo]
 * @param {number} [input.taxBps=0]
 * @param {string} [input.currency=USD]
 * @param {number} [input.negotiatedDiscountBps=0] B2B quote-only extra recurring discount
 * @param {number|null} [input.siteCountOverride] site count used for the volume tier
 */
function priceItems({
  lines,
  contractTermMonths = 0,
  segment = SEGMENTS.CONSUMER,
  promo = null,
  taxBps = 0,
  currency = 'USD',
  negotiatedDiscountBps = 0,
  siteCountOverride = null,
}) {
  if (!Array.isArray(lines)) throw new TypeError('lines must be an array');
  lines.forEach(validateLine);
  const term = resolveTerm(contractTermMonths);
  // Per-site orders converted from a multi-site quote keep the volume tier
  // earned by the whole quote via siteCountOverride.
  const siteCount = siteCountOverride ?? countPlanSites(lines);
  const volumeBps = segment === SEGMENTS.BUSINESS ? volumeDiscountBps(siteCount) : 0;

  const priced = lines.map((line) => priceLineBase(line, { term, volumeBps, segment }));
  applyNegotiatedDiscount(priced, negotiatedDiscountBps, currency);
  const promoSummary = applyPromo(promo, priced);
  applyTax(priced, taxBps);

  const recurring = summarizeRecurring(priced);
  const oneTime = summarizeOneTime(priced);
  const introMonthlyCredit = total(priced, 'introCredit') + total(priced, 'introCreditTax');
  const freeMonths = promoSummary ? promoSummary.freeMonths : 0;

  let totalContractValue = null;
  if (contractTermMonths > 0) {
    totalContractValue = oneTime.total + recurring.total * contractTermMonths - introMonthlyCredit * freeMonths;
  }

  return {
    currency,
    contractTermMonths,
    segment,
    taxBps,
    volumeDiscountBps: volumeBps,
    siteCount,
    lines: priced.map(toOutputLine),
    recurring,
    oneTime,
    promo: promoSummary,
    introductory: { freeMonths, monthlyCredit: introMonthlyCredit },
    dueToday: oneTime.total,
    firstMonthlyBill: Math.max(0, recurring.total - introMonthlyCredit),
    totalContractValue,
  };
}

module.exports = { priceItems, volumeDiscountBps, VOLUME_TIERS, resolveTerm };
