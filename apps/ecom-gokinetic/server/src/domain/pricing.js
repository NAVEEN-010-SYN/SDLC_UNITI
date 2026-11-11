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

const { applyBps, allocate } = require('./money');
const {
  CONTRACT_TERMS,
  PRODUCT_TYPES,
  PROMO_KINDS,
  PROMO_SCOPES,
  SEGMENTS,
} = require('./constants');

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
  const volumeDiscount =
    isPlan && segment === SEGMENTS.BUSINESS
      ? applyBps({ amount: afterTerm, currency: 'USD' }, volumeBps).amount
      : 0;

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

function isEligible(promo, line) {
  if (!promo.eligibleSkus || promo.eligibleSkus.length === 0) return true;
  return promo.eligibleSkus.includes(line.sku);
}

function scopeIncludes(scope, part) {
  const effective = scope || PROMO_SCOPES.ALL;
  return effective === PROMO_SCOPES.ALL || effective === part;
}

/**
 * Distributes a discount total across lines, never exceeding each line base.
 * @param {number} total
 * @param {number[]} bases
 */
function spreadCapped(total, bases) {
  const capped = Math.min(total, bases.reduce((a, b) => a + b, 0));
  return allocate(capped, bases);
}

/** Step 4: mutates priced lines with promo amounts; returns a promo summary. */
function applyPromo(promo, lines) {
  if (!promo) return null;
  const eligible = lines.filter((line) => isEligible(promo, line));
  const summary = {
    code: promo.code,
    kind: promo.kind,
    applied: false,
    recurringDiscount: 0,
    oneTimeDiscount: 0,
    freeMonths: 0,
    durationMonths: promo.durationMonths || null,
  };
  if (eligible.length === 0) return { ...summary, reason: 'NO_ELIGIBLE_ITEMS' };

  const recurringBases = eligible.map((l) => l.monthlyNet);
  const oneTimeBases = eligible.map((l) => l.hardware + l.installationNet);

  switch (promo.kind) {
    case PROMO_KINDS.PERCENT_OFF: {
      const bps = promo.valueBps || 0;
      let recurring = scopeIncludes(promo.scope, PROMO_SCOPES.RECURRING)
        ? recurringBases.map((b) => applyBps({ amount: b, currency: 'USD' }, bps).amount)
        : recurringBases.map(() => 0);
      let oneTime = scopeIncludes(promo.scope, PROMO_SCOPES.ONE_TIME)
        ? oneTimeBases.map((b) => applyBps({ amount: b, currency: 'USD' }, bps).amount)
        : oneTimeBases.map(() => 0);
      const cap = promo.maxDiscountAmount;
      const total = [...recurring, ...oneTime].reduce((a, b) => a + b, 0);
      if (cap && total > cap) {
        const scaled = allocate(cap, [...recurring, ...oneTime]);
        recurring = scaled.slice(0, recurring.length);
        oneTime = scaled.slice(recurring.length);
      }
      eligible.forEach((line, i) => {
        line.recurringPromo = recurring[i];
        line.oneTimePromo = oneTime[i];
      });
      break;
    }
    case PROMO_KINDS.FIXED_OFF: {
      // ALL scope: consume one-time charges first, then the remainder comes
      // off the first recurring month.
      let remaining = promo.valueAmount || 0;
      if (scopeIncludes(promo.scope, PROMO_SCOPES.ONE_TIME)) {
        const parts = spreadCapped(remaining, oneTimeBases);
        eligible.forEach((line, i) => {
          line.oneTimePromo = parts[i];
        });
        remaining -= parts.reduce((a, b) => a + b, 0);
      }
      if (remaining > 0 && scopeIncludes(promo.scope, PROMO_SCOPES.RECURRING)) {
        const parts = spreadCapped(remaining, recurringBases);
        eligible.forEach((line, i) => {
          line.recurringPromo = parts[i];
        });
      }
      break;
    }
    case PROMO_KINDS.FREE_INSTALLATION: {
      eligible.forEach((line) => {
        line.oneTimePromo = line.installationNet;
      });
      break;
    }
    case PROMO_KINDS.FREE_MONTHS: {
      eligible.forEach((line) => {
        line.introCredit = line.monthlyNet;
      });
      summary.freeMonths = promo.freeMonths || 1;
      break;
    }
    default:
      throw new RangeError(`Unknown promo kind ${promo.kind}`);
  }

  summary.recurringDiscount = eligible.reduce((a, l) => a + l.recurringPromo, 0);
  summary.oneTimeDiscount = eligible.reduce((a, l) => a + l.oneTimePromo, 0);
  const introValue = eligible.reduce((a, l) => a + l.introCredit, 0) * summary.freeMonths;
  summary.applied = summary.recurringDiscount + summary.oneTimeDiscount + introValue > 0;
  summary.totalValue =
    summary.oneTimeDiscount +
    summary.recurringDiscount * (promo.durationMonths || 1) +
    introValue;
  if (!summary.applied) summary.reason = 'NOTHING_TO_DISCOUNT';
  return summary;
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
  const siteCount =
    siteCountOverride ??
    lines.filter((l) => l.productType === PRODUCT_TYPES.PLAN).reduce((acc, l) => acc + l.quantity, 0);
  const volumeBps = segment === SEGMENTS.BUSINESS ? volumeDiscountBps(siteCount) : 0;

  const priced = lines.map((line) => priceLineBase(line, { term, volumeBps, segment }));

  if (negotiatedDiscountBps > 0) {
    for (const line of priced) {
      const extra = applyBps({ amount: line.monthlyNet, currency }, negotiatedDiscountBps).amount;
      line.negotiatedDiscount = extra;
      line.monthlyNet -= extra;
    }
  }

  const promoSummary = applyPromo(promo, priced);
  applyTax(priced, taxBps);

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

  const oneTime = {
    hardware: total(priced, 'hardware'),
    installation: total(priced, 'installationList'),
    installationWaived: total(priced, 'installationWaived'),
    promoDiscount: total(priced, 'oneTimePromo'),
    taxable: total(priced, 'oneTimeTaxable'),
    tax: total(priced, 'oneTimeTax'),
  };
  oneTime.total = oneTime.taxable + oneTime.tax;

  const introMonthlyCredit = total(priced, 'introCredit') + total(priced, 'introCreditTax');
  const firstMonthlyBill = Math.max(0, recurring.total - introMonthlyCredit);

  return {
    currency,
    contractTermMonths,
    segment,
    taxBps,
    volumeDiscountBps: volumeBps,
    siteCount,
    lines: priced.map((l) => ({
      sku: l.sku,
      productType: l.productType,
      quantity: l.quantity,
      monthlyList: l.monthlyList,
      monthlyNet: l.recurringTaxable,
      oneTimeNet: l.oneTimeTaxable,
      tax: l.recurringTax + l.oneTimeTax,
    })),
    recurring,
    oneTime,
    promo: promoSummary,
    introductory: { freeMonths: promoSummary ? promoSummary.freeMonths : 0, monthlyCredit: introMonthlyCredit },
    dueToday: oneTime.total,
    firstMonthlyBill,
    totalContractValue:
      contractTermMonths > 0
        ? oneTime.total + recurring.total * contractTermMonths - introMonthlyCredit * (promoSummary ? promoSummary.freeMonths : 0)
        : null,
  };
}

module.exports = { priceItems, volumeDiscountBps, VOLUME_TIERS, resolveTerm };
