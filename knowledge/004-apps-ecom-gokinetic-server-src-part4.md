# eCom (GoKinetic, Business GoKinetic) storefront & checkout: apps/ecom-gokinetic/server/src (part 4 of 8)

- **Application:** eCom (GoKinetic, Business GoKinetic) storefront & checkout
- **Tech stack:** MERN (MongoDB, Express, React, Node.js)
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 17

## Files

- `apps/ecom-gokinetic/server/src/domain/pricing.js` (341 lines)
- `apps/ecom-gokinetic/server/src/domain/pricing.test.js` (128 lines)
- `apps/ecom-gokinetic/server/src/domain/promoRules.js` (142 lines)
- `apps/ecom-gokinetic/server/src/domain/stateMachine.js` (122 lines)
- `apps/ecom-gokinetic/server/src/errors/index.js` (164 lines)
- `apps/ecom-gokinetic/server/src/integrations/emailNotifier.js` (69 lines)
- `apps/ecom-gokinetic/server/src/integrations/emailTemplates.js` (129 lines)
- `apps/ecom-gokinetic/server/src/integrations/httpClient.js` (158 lines)
- `apps/ecom-gokinetic/server/src/integrations/paymentGatewayClient.js` (114 lines)
- `apps/ecom-gokinetic/server/src/integrations/serviceabilityApiClient.js` (110 lines)
- `apps/ecom-gokinetic/server/src/jobs/index.js` (102 lines)
- `apps/ecom-gokinetic/server/src/jobs/jobs.test.js` (97 lines)
- `apps/ecom-gokinetic/server/src/jobs/scheduler.js` (96 lines)
- `apps/ecom-gokinetic/server/src/middleware/asyncHandler.js` (14 lines)
- `apps/ecom-gokinetic/server/src/middleware/auth.js` (83 lines)
- `apps/ecom-gokinetic/server/src/middleware/correlationId.js` (25 lines)
- `apps/ecom-gokinetic/server/src/middleware/errorHandler.js` (98 lines)

## apps/ecom-gokinetic/server/src/domain/pricing.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/pricing.js`.

```javascript
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
```

## apps/ecom-gokinetic/server/src/domain/pricing.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/pricing.test.js`.

```javascript
'use strict';

const { priceItems, volumeDiscountBps } = require('./pricing');

const plan = (overrides = {}) => ({
  sku: 'GK-FIBRE-1000',
  productType: 'PLAN',
  quantity: 1,
  unitMonthly: 8000,
  unitOneTime: 0,
  unitInstallation: 9900,
  ...overrides,
});

describe('priceItems', () => {
  test('24-month term discounts the plan, waives installation and taxes the net', () => {
    const result = priceItems({ lines: [plan()], contractTermMonths: 24, taxBps: 625 });
    expect(result.recurring).toMatchObject({ subtotal: 8000, termDiscount: 400, taxable: 7600, tax: 475, total: 8075 });
    expect(result.oneTime).toMatchObject({ installation: 9900, installationWaived: 9900, total: 0 });
    expect(result.dueToday).toBe(0);
    expect(result.totalContractValue).toBe(8075 * 24);
  });

  test('no-contract plans pay installation up front and have no contract value', () => {
    const result = priceItems({ lines: [plan()], contractTermMonths: 0 });
    expect(result.dueToday).toBe(9900);
    expect(result.recurring.total).toBe(8000);
    expect(result.totalContractValue).toBeNull();
  });

  test('term discounts never apply to add-ons or hardware', () => {
    const result = priceItems({
      lines: [plan(), { sku: 'ADD-STATIC-IP', productType: 'ADDON', quantity: 2, unitMonthly: 1000 }],
      contractTermMonths: 36,
    });
    expect(result.recurring.termDiscount).toBe(800);
    expect(result.lines.find((l) => l.sku === 'ADD-STATIC-IP').monthlyNet).toBe(2000);
  });

  test('business volume tier stacks after the term discount', () => {
    const result = priceItems({
      lines: [plan({ sku: 'BGK-FIBRE-1000', unitMonthly: 14900, quantity: 10 })],
      contractTermMonths: 36,
      segment: 'BUSINESS',
    });
    expect(result.volumeDiscountBps).toBe(1000);
    expect(result.recurring.termDiscount).toBe(14900);
    expect(result.recurring.volumeDiscount).toBe(13410);
    expect(result.recurring.taxable).toBe(120690);
  });

  test('siteCountOverride keeps the estate-wide tier on per-site orders', () => {
    const result = priceItems({
      lines: [plan({ unitMonthly: 10000 })],
      contractTermMonths: 12,
      segment: 'BUSINESS',
      siteCountOverride: 25,
    });
    expect(result.volumeDiscountBps).toBe(1500);
    expect(result.recurring.taxable).toBe(8500);
  });

  test('FREE_INSTALLATION removes the installation charge', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'FREEINSTALL', kind: 'FREE_INSTALLATION' },
    });
    expect(result.dueToday).toBe(0);
    expect(result.promo).toMatchObject({ applied: true, oneTimeDiscount: 9900 });
  });

  test('FIXED_OFF consumes one-time charges first, then recurring', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'SAVE120', kind: 'FIXED_OFF', valueAmount: 12000 },
    });
    expect(result.oneTime.promoDiscount).toBe(9900);
    expect(result.recurring.promoDiscount).toBe(2100);
  });

  test('PERCENT_OFF honours its cap', () => {
    const result = priceItems({
      lines: [plan({ unitMonthly: 20000, unitInstallation: 0 })],
      promo: { code: 'HALF', kind: 'PERCENT_OFF', valueBps: 5000, maxDiscountAmount: 3000 },
    });
    expect(result.recurring.promoDiscount).toBe(3000);
  });

  test('FREE_MONTHS credits the first bill including tax', () => {
    const result = priceItems({
      lines: [plan()],
      contractTermMonths: 24,
      taxBps: 625,
      promo: { code: 'WELCOME-3FREE', kind: 'FREE_MONTHS', freeMonths: 3 },
    });
    expect(result.introductory).toEqual({ freeMonths: 3, monthlyCredit: 8075 });
    expect(result.firstMonthlyBill).toBe(0);
    expect(result.totalContractValue).toBe(8075 * 21);
  });

  test('promo restricted to other SKUs is reported but not applied', () => {
    const result = priceItems({
      lines: [plan()],
      promo: { code: 'IPDEAL', kind: 'PERCENT_OFF', valueBps: 1000, eligibleSkus: ['ADD-STATIC-IP'] },
    });
    expect(result.promo).toMatchObject({ applied: false, reason: 'NO_ELIGIBLE_ITEMS' });
  });

  test('rejects unsupported terms and malformed lines', () => {
    expect(() => priceItems({ lines: [plan()], contractTermMonths: 18 })).toThrow(RangeError);
    expect(() => priceItems({ lines: [plan({ quantity: 0 })] })).toThrow(RangeError);
    expect(() => priceItems({ lines: [plan({ unitMonthly: 10.5 })] })).toThrow(RangeError);
  });
});

describe('volumeDiscountBps', () => {
  test.each([
    [1, 0],
    [4, 0],
    [5, 500],
    [10, 1000],
    [24, 1000],
    [25, 1500],
  ])('%i sites -> %i bps', (sites, bps) => {
    expect(volumeDiscountBps(sites)).toBe(bps);
  });
});
```

## apps/ecom-gokinetic/server/src/domain/promoRules.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/promoRules.js`.

```javascript
'use strict';

const { PROMO_KINDS, PROMO_SCOPES } = require('./constants');

/**
 * Rule codes returned when a promo code cannot be applied. They are surfaced to
 * the storefront so it can show a precise message.
 */
const PROMO_REJECTIONS = Object.freeze({
  INACTIVE: 'PROMO_INACTIVE',
  NOT_STARTED: 'PROMO_NOT_STARTED',
  EXPIRED: 'PROMO_EXPIRED',
  SEGMENT_MISMATCH: 'PROMO_SEGMENT_MISMATCH',
  USAGE_EXHAUSTED: 'PROMO_USAGE_EXHAUSTED',
  ACCOUNT_LIMIT_REACHED: 'PROMO_ACCOUNT_LIMIT_REACHED',
  MIN_SPEND_NOT_MET: 'PROMO_MIN_SPEND_NOT_MET',
  NO_ELIGIBLE_ITEMS: 'PROMO_NO_ELIGIBLE_ITEMS',
  TERM_TOO_SHORT: 'PROMO_TERM_TOO_SHORT',
  NEW_CUSTOMERS_ONLY: 'PROMO_NEW_CUSTOMERS_ONLY',
});

const MESSAGES = {
  [PROMO_REJECTIONS.INACTIVE]: 'This promo code is no longer available.',
  [PROMO_REJECTIONS.NOT_STARTED]: 'This promo code is not active yet.',
  [PROMO_REJECTIONS.EXPIRED]: 'This promo code has expired.',
  [PROMO_REJECTIONS.SEGMENT_MISMATCH]: 'This promo code is not valid for this storefront.',
  [PROMO_REJECTIONS.USAGE_EXHAUSTED]: 'This promo code has reached its redemption limit.',
  [PROMO_REJECTIONS.ACCOUNT_LIMIT_REACHED]: 'You have already used this promo code.',
  [PROMO_REJECTIONS.MIN_SPEND_NOT_MET]: 'Your order does not meet the minimum monthly spend for this code.',
  [PROMO_REJECTIONS.NO_ELIGIBLE_ITEMS]: 'None of the items in your cart qualify for this code.',
  [PROMO_REJECTIONS.TERM_TOO_SHORT]: 'This promo code requires a longer contract term.',
  [PROMO_REJECTIONS.NEW_CUSTOMERS_ONLY]: 'This promo code is only available to new customers.',
};

/**
 * Checks whether a promo can be applied in a given purchase context.
 *
 * @param {object} promo persisted promo document (plain object)
 * @param {object} ctx
 * @param {Date} ctx.now
 * @param {string} ctx.segment CONSUMER | BUSINESS
 * @param {string[]} ctx.skus SKUs in the cart
 * @param {number} ctx.monthlySubtotal list monthly subtotal in minor units
 * @param {number} ctx.contractTermMonths
 * @param {number} [ctx.accountRedemptions] times this account already redeemed it
 * @param {boolean} [ctx.isExistingCustomer]
 * @returns {{ ok: true } | { ok: false, code: string, message: string }}
 */
function evaluatePromoEligibility(promo, ctx) {
  const reject = (code) => ({ ok: false, code, message: MESSAGES[code] });
  const now = ctx.now || new Date();

  if (!promo.active) return reject(PROMO_REJECTIONS.INACTIVE);
  if (promo.startsAt && new Date(promo.startsAt) > now) return reject(PROMO_REJECTIONS.NOT_STARTED);
  if (promo.endsAt && new Date(promo.endsAt) <= now) return reject(PROMO_REJECTIONS.EXPIRED);
  if (promo.segments && promo.segments.length > 0 && !promo.segments.includes(ctx.segment)) {
    return reject(PROMO_REJECTIONS.SEGMENT_MISMATCH);
  }
  if (promo.maxRedemptions != null && (promo.redemptionCount || 0) >= promo.maxRedemptions) {
    return reject(PROMO_REJECTIONS.USAGE_EXHAUSTED);
  }
  if (promo.perAccountLimit != null && (ctx.accountRedemptions || 0) >= promo.perAccountLimit) {
    return reject(PROMO_REJECTIONS.ACCOUNT_LIMIT_REACHED);
  }
  if (promo.newCustomersOnly && ctx.isExistingCustomer) {
    return reject(PROMO_REJECTIONS.NEW_CUSTOMERS_ONLY);
  }
  if (promo.minMonthlySpend && (ctx.monthlySubtotal || 0) < promo.minMonthlySpend) {
    return reject(PROMO_REJECTIONS.MIN_SPEND_NOT_MET);
  }
  if (promo.minContractTermMonths && (ctx.contractTermMonths || 0) < promo.minContractTermMonths) {
    return reject(PROMO_REJECTIONS.TERM_TOO_SHORT);
  }
  if (promo.eligibleSkus && promo.eligibleSkus.length > 0) {
    const hit = (ctx.skus || []).some((sku) => promo.eligibleSkus.includes(sku));
    if (!hit) return reject(PROMO_REJECTIONS.NO_ELIGIBLE_ITEMS);
  }
  return { ok: true };
}

/**
 * Validates the shape of a promo definition before it is persisted.
 * @returns {Array<{path: string, message: string}>} empty when valid
 */
function validatePromoDefinition(promo) {
  const errors = [];
  const push = (path, message) => errors.push({ path, message });
  if (!/^[A-Z0-9-]{4,24}$/.test(promo.code || '')) {
    push('code', 'Code must be 4-24 characters of A-Z, 0-9 or dash.');
  }
  if (!Object.values(PROMO_KINDS).includes(promo.kind)) push('kind', 'Unknown promo kind.');
  if (promo.scope && !Object.values(PROMO_SCOPES).includes(promo.scope)) push('scope', 'Unknown scope.');
  switch (promo.kind) {
    case PROMO_KINDS.PERCENT_OFF:
      if (!Number.isInteger(promo.valueBps) || promo.valueBps <= 0 || promo.valueBps > 10000) {
        push('valueBps', 'Percent promos need valueBps between 1 and 10000.');
      }
      break;
    case PROMO_KINDS.FIXED_OFF:
      if (!Number.isInteger(promo.valueAmount) || promo.valueAmount <= 0) {
        push('valueAmount', 'Fixed promos need a positive valueAmount in minor units.');
      }
      break;
    case PROMO_KINDS.FREE_MONTHS:
      if (!Number.isInteger(promo.freeMonths) || promo.freeMonths < 1 || promo.freeMonths > 12) {
        push('freeMonths', 'Free-month promos need freeMonths between 1 and 12.');
      }
      break;
    default:
      break;
  }
  if (promo.startsAt && promo.endsAt && new Date(promo.startsAt) >= new Date(promo.endsAt)) {
    push('endsAt', 'endsAt must be after startsAt.');
  }
  if (promo.maxRedemptions != null && (!Number.isInteger(promo.maxRedemptions) || promo.maxRedemptions < 1)) {
    push('maxRedemptions', 'maxRedemptions must be a positive integer.');
  }
  return errors;
}

/** Converts a persisted promo into the descriptor the pricing engine expects. */
function toPricingDescriptor(promo) {
  return {
    code: promo.code,
    kind: promo.kind,
    scope: promo.scope || PROMO_SCOPES.ALL,
    valueBps: promo.valueBps,
    valueAmount: promo.valueAmount,
    freeMonths: promo.freeMonths,
    maxDiscountAmount: promo.maxDiscountAmount,
    durationMonths: promo.durationMonths,
    eligibleSkus: promo.eligibleSkus || [],
  };
}

module.exports = {
  PROMO_REJECTIONS,
  evaluatePromoEligibility,
  validatePromoDefinition,
  toPricingDescriptor,
};
```

## apps/ecom-gokinetic/server/src/domain/stateMachine.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/domain/stateMachine.js`.

```javascript
'use strict';

const { InvalidStateTransitionError } = require('../errors');
const { ORDER_STATUS, QUOTE_STATUS } = require('./constants');

/**
 * Small declarative finite-state machine.
 *
 * `transitions` maps each state to the states it may move to. Guards are
 * evaluated with the entity and context and may veto a transition by
 * returning a string reason.
 */
function createStateMachine({ entity, transitions, terminal = [], guards = {} }) {
  const states = new Set(Object.keys(transitions));

  function allowedTargets(from) {
    return transitions[from] || [];
  }

  function canTransition(from, to) {
    return allowedTargets(from).includes(to);
  }

  /**
   * Validates a transition and returns a history entry to append.
   * @param {object} record entity with a `status` field
   * @param {string} to target state
   * @param {{actor?: string, reason?: string, at?: Date}} [context]
   */
  function transition(record, to, context = {}) {
    const from = record.status;
    if (!states.has(to)) {
      throw new RangeError(`Unknown ${entity} state ${to}`);
    }
    if (!canTransition(from, to)) {
      throw new InvalidStateTransitionError(entity, from, to);
    }
    const guard = guards[`${from}->${to}`] || guards[`*->${to}`];
    if (guard) {
      const veto = guard(record, context);
      if (veto) {
        const err = new InvalidStateTransitionError(entity, from, to);
        err.detail = `${err.detail} ${veto}`;
        err.message = err.detail;
        throw err;
      }
    }
    return {
      from,
      to,
      at: (context.at || new Date()).toISOString(),
      actor: context.actor || 'system',
      reason: context.reason || null,
    };
  }

  function isTerminal(state) {
    return terminal.includes(state);
  }

  return { entity, states: [...states], allowedTargets, canTransition, transition, isTerminal };
}

/**
 * Order lifecycle: DRAFT -> SUBMITTED -> VALIDATED -> PROVISIONING -> ACTIVE,
 * with CANCELLED / FAILED exits. Cancellation is not allowed once provisioning
 * has started; those must go through a support ticket.
 */
const orderStateMachine = createStateMachine({
  entity: 'Order',
  transitions: {
    [ORDER_STATUS.DRAFT]: [ORDER_STATUS.SUBMITTED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SUBMITTED]: [ORDER_STATUS.VALIDATED, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
    [ORDER_STATUS.VALIDATED]: [ORDER_STATUS.PROVISIONING, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
    [ORDER_STATUS.PROVISIONING]: [ORDER_STATUS.ACTIVE, ORDER_STATUS.FAILED],
    [ORDER_STATUS.ACTIVE]: [],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.FAILED]: [],
  },
  terminal: [ORDER_STATUS.ACTIVE, ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED],
  guards: {
    [`${ORDER_STATUS.DRAFT}->${ORDER_STATUS.SUBMITTED}`]: (order) =>
      !order.items || order.items.length === 0 ? 'Order has no items.' : null,
    [`*->${ORDER_STATUS.FAILED}`]: (_order, ctx) =>
      !ctx.reason ? 'A failure reason is required.' : null,
  },
});

/**
 * B2B quote lifecycle. Quotes whose negotiated discount exceeds the approval
 * threshold must pass through PENDING_APPROVAL before being sent.
 */
const quoteStateMachine = createStateMachine({
  entity: 'Quote',
  transitions: {
    [QUOTE_STATUS.REQUESTED]: [QUOTE_STATUS.PRICED, QUOTE_STATUS.REJECTED],
    [QUOTE_STATUS.PRICED]: [
      QUOTE_STATUS.PRICED,
      QUOTE_STATUS.PENDING_APPROVAL,
      QUOTE_STATUS.SENT,
      QUOTE_STATUS.REJECTED,
    ],
    [QUOTE_STATUS.PENDING_APPROVAL]: [QUOTE_STATUS.SENT, QUOTE_STATUS.PRICED, QUOTE_STATUS.REJECTED],
    [QUOTE_STATUS.SENT]: [QUOTE_STATUS.ACCEPTED, QUOTE_STATUS.REJECTED, QUOTE_STATUS.EXPIRED],
    [QUOTE_STATUS.ACCEPTED]: [QUOTE_STATUS.CONVERTED, QUOTE_STATUS.EXPIRED],
    [QUOTE_STATUS.REJECTED]: [],
    [QUOTE_STATUS.EXPIRED]: [],
    [QUOTE_STATUS.CONVERTED]: [],
  },
  terminal: [QUOTE_STATUS.REJECTED, QUOTE_STATUS.EXPIRED, QUOTE_STATUS.CONVERTED],
  guards: {
    [`${QUOTE_STATUS.PRICED}->${QUOTE_STATUS.SENT}`]: (quote, ctx) =>
      quote.requiresApproval && !ctx.approved ? 'Quote discount requires approval before sending.' : null,
    [`${QUOTE_STATUS.SENT}->${QUOTE_STATUS.ACCEPTED}`]: (quote, ctx) => {
      const now = ctx.at || new Date();
      return quote.validUntil && new Date(quote.validUntil) < now ? 'Quote has expired.' : null;
    },
  },
});

module.exports = { createStateMachine, orderStateMachine, quoteStateMachine };
```

## apps/ecom-gokinetic/server/src/errors/index.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/errors/index.js`.

```javascript
'use strict';

/**
 * Application error hierarchy. Each error maps to an RFC 7807 problem type so
 * the error handler can render `application/problem+json` without guessing.
 */

const PROBLEM_BASE = 'https://errors.gokinetic.example/problems';

class AppError extends Error {
  /**
   * @param {object} params
   * @param {number} params.status HTTP status code
   * @param {string} params.type   short problem slug, e.g. "validation-error"
   * @param {string} params.title  human readable, stable summary
   * @param {string} [params.detail] occurrence specific explanation
   * @param {object} [params.extensions] extra problem members (e.g. `errors`)
   */
  constructor({ status, type, title, detail, extensions }) {
    super(detail || title);
    this.name = this.constructor.name;
    this.status = status;
    this.type = `${PROBLEM_BASE}/${type}`;
    this.title = title;
    this.detail = detail;
    this.extensions = extensions || {};
    this.expose = true;
  }
}

class ValidationError extends AppError {
  /** @param {Array<{path: string, message: string}>} errors */
  constructor(errors, detail = 'One or more fields are invalid.') {
    super({
      status: 400,
      type: 'validation-error',
      title: 'Request validation failed',
      detail,
      extensions: { errors },
    });
  }
}

class UnauthorizedError extends AppError {
  constructor(detail = 'Authentication is required to access this resource.') {
    super({ status: 401, type: 'unauthorized', title: 'Unauthorized', detail });
  }
}

class ForbiddenError extends AppError {
  constructor(detail = 'You do not have permission to perform this action.') {
    super({ status: 403, type: 'forbidden', title: 'Forbidden', detail });
  }
}

class NotFoundError extends AppError {
  constructor(resource, id) {
    super({
      status: 404,
      type: 'not-found',
      title: 'Resource not found',
      detail: id ? `${resource} '${id}' was not found.` : `${resource} was not found.`,
      extensions: { resource },
    });
  }
}

class ConflictError extends AppError {
  constructor(detail, extensions) {
    super({ status: 409, type: 'conflict', title: 'Conflict', detail, extensions });
  }
}

class BusinessRuleError extends AppError {
  /**
   * A request that is well-formed but violates a domain rule
   * (e.g. promo expired, address not serviceable).
   * @param {string} code machine-readable rule code
   * @param {string} detail
   * @param {object} [extensions]
   */
  constructor(code, detail, extensions = {}) {
    super({
      status: 422,
      type: 'business-rule-violation',
      title: 'Business rule violated',
      detail,
      extensions: { code, ...extensions },
    });
    this.code = code;
  }
}

class InvalidStateTransitionError extends AppError {
  constructor(entity, from, to) {
    super({
      status: 409,
      type: 'invalid-state-transition',
      title: 'Invalid state transition',
      detail: `${entity} cannot move from ${from} to ${to}.`,
      extensions: { entity, from, to },
    });
  }
}

class PaymentDeclinedError extends AppError {
  constructor(reason, extensions = {}) {
    super({
      status: 402,
      type: 'payment-declined',
      title: 'Payment declined',
      detail: reason || 'The payment method was declined.',
      extensions,
    });
  }
}

class RateLimitError extends AppError {
  constructor(retryAfterSeconds) {
    super({
      status: 429,
      type: 'rate-limited',
      title: 'Too many requests',
      detail: `Rate limit exceeded. Retry after ${retryAfterSeconds} seconds.`,
      extensions: { retryAfterSeconds },
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

class UpstreamError extends AppError {
  /**
   * @param {string} dependency name of the failing upstream (e.g. "payment-gateway")
   * @param {string} detail
   * @param {number} [upstreamStatus]
   */
  constructor(dependency, detail, upstreamStatus) {
    super({
      status: 502,
      type: 'upstream-failure',
      title: 'Upstream dependency failed',
      detail,
      extensions: { dependency, ...(upstreamStatus ? { upstreamStatus } : {}) },
    });
    this.dependency = dependency;
    this.upstreamStatus = upstreamStatus;
  }
}

module.exports = {
  PROBLEM_BASE,
  AppError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  NotFoundError,
  ConflictError,
  BusinessRuleError,
  InvalidStateTransitionError,
  PaymentDeclinedError,
  RateLimitError,
  UpstreamError,
};
```

## apps/ecom-gokinetic/server/src/integrations/emailNotifier.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/integrations/emailNotifier.js`.

```javascript
'use strict';

const { createHttpClient } = require('./httpClient');
const { render } = require('./emailTemplates');
const { logger } = require('../config/logger');

/**
 * Sends transactional email through the provider's REST API and records
 * every attempt in the email log.
 *
 * Email is best-effort: failures are logged and recorded but never propagate
 * to the caller, so a provider outage cannot fail an order placement.
 */
function createEmailNotifier({ baseUrl, apiKey, fromAddress, timeoutMs, http, emailLog, log = logger } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'email-provider',
      baseUrl,
      timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
      maxRetries: 1,
    });

  /**
   * @param {object} params
   * @param {string} params.template template name
   * @param {string} params.to recipient
   * @param {string} params.reference business reference for de-duplication
   * @param {object} params.data template data
   * @param {boolean} [params.dedupe] skip if already sent for this reference
   * @returns {Promise<{sent: boolean, skipped?: boolean}>}
   */
  async function send({ template, to, reference, data, dedupe = false }) {
    if (dedupe && emailLog && (await emailLog.wasSent(template, reference))) {
      return { sent: false, skipped: true };
    }
    const { subject, text, html } = render(template, data);
    try {
      const res = await client.post(
        '/messages',
        { from: fromAddress, to: [to], subject, text, html, tags: [template], metadata: { reference } },
        { retryable: true, headers: { 'Idempotency-Key': `${template}-${reference}` } },
      );
      if (emailLog) {
        await emailLog.record({
          template,
          to,
          reference,
          status: 'SENT',
          providerMessageId: res.data ? res.data.id : undefined,
        });
      }
      log.info('email.sent', { template, reference });
      return { sent: true };
    } catch (err) {
      log.warn('email.failed', { template, reference, error: err.message });
      if (emailLog) {
        await emailLog.record({ template, to, reference, status: 'FAILED', error: err.message }).catch(() => {});
      }
      return { sent: false };
    }
  }

  return { send };
}

module.exports = { createEmailNotifier };
```

## apps/ecom-gokinetic/server/src/integrations/emailTemplates.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/integrations/emailTemplates.js`.

```javascript
'use strict';

const { format } = require('../domain/money');
const { formatAddress } = require('../domain/address');

/**
 * Transactional email templates. Each template returns `{ subject, text, html }`.
 * HTML is intentionally simple: the email provider wraps it in the branded
 * layout configured per sender domain.
 */

const BRAND = {
  CONSUMER: 'GoKinetic',
  BUSINESS: 'Business GoKinetic',
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const usd = (amount, currency = 'USD') => format({ amount, currency });

function itemsTable(items) {
  const rows = items
    .map(
      (i) =>
        `<tr><td>${escapeHtml(i.name)}</td><td>${i.quantity}</td><td>${usd(i.unitMonthly * i.quantity)}/mo</td></tr>`,
    )
    .join('');
  return `<table><thead><tr><th>Item</th><th>Qty</th><th>Monthly</th></tr></thead><tbody>${rows}</tbody></table>`;
}

const templates = {
  ORDER_CONFIRMATION: ({ order }) => {
    const brand = BRAND[order.segment] || BRAND.CONSUMER;
    const subject = `${brand} order ${order.orderNumber} received`;
    const text = [
      `Hi ${order.contact.firstName},`,
      `Thanks for your order ${order.orderNumber}.`,
      `Service address: ${formatAddress(order.serviceAddress)}`,
      `Due today: ${usd(order.dueToday)}`,
      `Monthly: ${usd(order.monthlyRecurring)}`,
      'We will email you again once your installation is scheduled.',
    ].join('\n');
    const html = `<p>Hi ${escapeHtml(order.contact.firstName)},</p>
<p>Thanks for your order <strong>${escapeHtml(order.orderNumber)}</strong>.</p>
<p>Service address: ${escapeHtml(formatAddress(order.serviceAddress))}</p>
${itemsTable(order.items)}
<p>Due today: <strong>${usd(order.dueToday)}</strong><br/>Monthly: <strong>${usd(order.monthlyRecurring)}</strong></p>`;
    return { subject, text, html };
  },

  ORDER_STATUS_CHANGED: ({ order, status }) => {
    const brand = BRAND[order.segment] || BRAND.CONSUMER;
    const labels = {
      VALIDATED: 'has been confirmed',
      PROVISIONING: 'is being set up - your installation is scheduled',
      ACTIVE: 'is now active. Welcome to fibre!',
      CANCELLED: 'has been cancelled',
      FAILED: 'could not be completed',
    };
    const phrase = labels[status] || `is now ${status.toLowerCase()}`;
    const subject = `${brand} order ${order.orderNumber} ${status === 'ACTIVE' ? 'is live' : 'update'}`;
    const appointment = order.installAppointment
      ? `Installation: ${new Date(order.installAppointment).toUTCString()}`
      : '';
    const text = [`Hi ${order.contact.firstName},`, `Your order ${order.orderNumber} ${phrase}.`, appointment]
      .filter(Boolean)
      .join('\n');
    const html = `<p>Hi ${escapeHtml(order.contact.firstName)},</p><p>Your order <strong>${escapeHtml(
      order.orderNumber,
    )}</strong> ${escapeHtml(phrase)}.</p>${appointment ? `<p>${escapeHtml(appointment)}</p>` : ''}`;
    return { subject, text, html };
  },

  ABANDONED_CART: ({ firstName, cart, resumeUrl }) => {
    const brand = BRAND[cart.segment] || BRAND.CONSUMER;
    const subject = `Your ${brand} cart is waiting`;
    const names = cart.items.map((i) => i.name).join(', ');
    const text = `Hi ${firstName},\nYou left ${names} in your cart. Pick up where you left off: ${resumeUrl}`;
    const html = `<p>Hi ${escapeHtml(firstName)},</p><p>You left ${escapeHtml(names)} in your cart.</p><p><a href="${escapeHtml(
      resumeUrl,
    )}">Resume checkout</a></p>`;
    return { subject, text, html };
  },

  QUOTE_SENT: ({ quote, viewUrl }) => {
    const subject = `Business GoKinetic quote ${quote.quoteNumber}`;
    const monthly = quote.pricing ? usd(quote.pricing.recurring.total) : 'n/a';
    const validUntil = quote.validUntil ? new Date(quote.validUntil).toISOString().slice(0, 10) : 'n/a';
    const text = `Your quote ${quote.quoteNumber} for ${quote.sites.length} site(s) is ready.\nMonthly: ${monthly}\nValid until: ${validUntil}\n${viewUrl}`;
    const html = `<p>Your quote <strong>${escapeHtml(quote.quoteNumber)}</strong> for ${quote.sites.length} site(s) is ready.</p>
<p>Monthly: <strong>${monthly}</strong><br/>Valid until: ${validUntil}</p><p><a href="${escapeHtml(viewUrl)}">Review and accept</a></p>`;
    return { subject, text, html };
  },

  QUOTE_EXPIRED: ({ quote }) => {
    const subject = `Business GoKinetic quote ${quote.quoteNumber} has expired`;
    const text = `Quote ${quote.quoteNumber} expired. Reply to this email or request a new quote online.`;
    return { subject, text, html: `<p>${escapeHtml(text)}</p>` };
  },

  USER_INVITED: ({ inviter, accountName, activationUrl }) => {
    const subject = `You've been invited to ${accountName} on Business GoKinetic`;
    const text = `${inviter} invited you to manage ${accountName}. Activate your login: ${activationUrl}`;
    const html = `<p>${escapeHtml(inviter)} invited you to manage <strong>${escapeHtml(accountName)}</strong>.</p><p><a href="${escapeHtml(
      activationUrl,
    )}">Activate your login</a></p>`;
    return { subject, text, html };
  },
};

/**
 * @param {keyof templates} name
 * @param {object} data
 */
function render(name, data) {
  const template = templates[name];
  if (!template) throw new RangeError(`Unknown email template ${name}`);
  return template(data);
}

module.exports = { render, escapeHtml, TEMPLATE_NAMES: Object.keys(templates) };
```

## apps/ecom-gokinetic/server/src/integrations/httpClient.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/integrations/httpClient.js`.

```javascript
'use strict';

const { currentCorrelationId, logger } = require('../config/logger');
const { UpstreamError } = require('../errors');

/**
 * Shared outbound HTTP client for upstream integrations.
 *
 * - per-request timeout via AbortController
 * - bounded retries with jittered exponential back-off on network errors,
 *   408/429/5xx (only for methods/calls flagged retryable)
 * - X-Correlation-Id propagation from the current request context
 * - a simple consecutive-failure circuit breaker so a dead dependency fails
 *   fast instead of tying up request threads
 */

const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function createCircuitBreaker({ failureThreshold = 5, resetAfterMs = 30000, now = () => Date.now() } = {}) {
  let failures = 0;
  let openedAt = null;
  return {
    /** @returns {'CLOSED'|'OPEN'|'HALF_OPEN'} */
    state() {
      if (openedAt === null) return 'CLOSED';
      return now() - openedAt >= resetAfterMs ? 'HALF_OPEN' : 'OPEN';
    },
    canRequest() {
      return this.state() !== 'OPEN';
    },
    recordSuccess() {
      failures = 0;
      openedAt = null;
    },
    recordFailure() {
      failures += 1;
      if (failures >= failureThreshold || this.state() === 'HALF_OPEN') openedAt = now();
    },
  };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {object} options
 * @param {string} options.name dependency name for errors/logs
 * @param {string} options.baseUrl
 * @param {Record<string,string>} [options.headers] default headers (auth)
 * @param {number} [options.timeoutMs]
 * @param {number} [options.maxRetries]
 * @param {number} [options.baseDelayMs]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {object} [options.breaker]
 */
function createHttpClient({
  name,
  baseUrl,
  headers = {},
  timeoutMs = 5000,
  maxRetries = 2,
  baseDelayMs = 200,
  fetchImpl = globalThis.fetch,
  breaker = createCircuitBreaker(),
  log = logger,
}) {
  async function attempt(method, url, body, extraHeaders) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const correlationId = currentCorrelationId();
    try {
      const response = await fetchImpl(url, {
        method,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(correlationId ? { 'X-Correlation-Id': correlationId } : {}),
          ...headers,
          ...extraHeaders,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      const text = await response.text();
      let data = null;
      if (text) {
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text };
        }
      }
      return { status: response.status, ok: response.ok, data };
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * @param {string} method
   * @param {string} path
   * @param {{ body?: unknown, headers?: object, retryable?: boolean, expectedStatuses?: number[] }} [opts]
   * @returns {Promise<{status:number, ok:boolean, data:any}>}
   *   Resolves for 2xx and for any status in `expectedStatuses` (e.g. 402 for
   *   declines); otherwise throws UpstreamError.
   */
  async function request(method, path, { body, headers: extraHeaders = {}, retryable, expectedStatuses = [] } = {}) {
    if (!breaker.canRequest()) {
      throw new UpstreamError(name, `${name} is temporarily unavailable (circuit open).`);
    }
    const url = `${baseUrl.replace(/\/$/, '')}${path}`;
    const canRetry = retryable ?? ['GET', 'PUT', 'DELETE'].includes(method);
    let lastError;

    for (let i = 0; i <= (canRetry ? maxRetries : 0); i += 1) {
      if (i > 0) {
        const delay = baseDelayMs * 2 ** (i - 1) + Math.floor(Math.random() * baseDelayMs);
        await sleep(delay);
      }
      const started = Date.now();
      try {
        const res = await attempt(method, url, body, extraHeaders);
        log.debug('upstream.response', { dependency: name, method, path, status: res.status, ms: Date.now() - started });
        if (res.ok || expectedStatuses.includes(res.status)) {
          breaker.recordSuccess();
          return res;
        }
        lastError = new UpstreamError(name, `${name} responded with HTTP ${res.status}.`, res.status);
        if (!RETRYABLE_STATUS.has(res.status)) {
          if (res.status >= 500) breaker.recordFailure();
          throw lastError;
        }
      } catch (err) {
        if (err instanceof UpstreamError && !RETRYABLE_STATUS.has(err.upstreamStatus)) throw err;
        lastError =
          err instanceof UpstreamError
            ? err
            : new UpstreamError(
                name,
                err.name === 'AbortError' ? `${name} timed out after ${timeoutMs}ms.` : `${name} is unreachable.`,
              );
      }
      log.warn('upstream.retryable_failure', { dependency: name, method, path, attempt: i + 1, error: lastError.detail });
    }
    breaker.recordFailure();
    throw lastError;
  }

  return {
    get: (path, opts) => request('GET', path, opts),
    post: (path, body, opts = {}) => request('POST', path, { ...opts, body }),
    put: (path, body, opts = {}) => request('PUT', path, { ...opts, body }),
    delete: (path, opts) => request('DELETE', path, opts),
    breaker,
  };
}

module.exports = { createHttpClient, createCircuitBreaker, RETRYABLE_STATUS };
```

## apps/ecom-gokinetic/server/src/integrations/paymentGatewayClient.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/integrations/paymentGatewayClient.js`.

```javascript
'use strict';

const { createHttpClient } = require('./httpClient');
const { PaymentDeclinedError, UpstreamError } = require('../errors');

/**
 * Client for the card payment gateway.
 *
 * The storefront never sees card numbers: the browser tokenises the card with
 * the gateway's hosted fields and we receive an opaque `paymentToken`. We
 * authorise at checkout (due-today amount) and capture once the order is
 * validated, voiding the authorisation if validation fails.
 *
 * Every mutating call carries an Idempotency-Key derived from the order
 * number so retries never double-charge.
 */

const DECLINE_MESSAGES = {
  insufficient_funds: 'The card has insufficient funds.',
  card_expired: 'The card has expired.',
  do_not_honor: 'The card issuer declined the payment.',
  invalid_cvc: 'The security code is incorrect.',
  fraud_suspected: 'The payment could not be processed. Please contact your bank.',
};

function createPaymentGatewayClient({ baseUrl, apiKey, timeoutMs, http } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'payment-gateway',
      baseUrl,
      timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}` },
      maxRetries: 2,
    });

  function toDecline(data) {
    const code = (data && data.decline_code) || 'do_not_honor';
    return new PaymentDeclinedError(DECLINE_MESSAGES[code] || DECLINE_MESSAGES.do_not_honor, {
      declineCode: code,
    });
  }

  return {
    /**
     * Places a hold for `amount` minor units.
     * @returns {Promise<{reference: string, status: string, last4: string|null, brand: string|null}>}
     */
    async authorize({ orderNumber, amount, currency, paymentToken, customerEmail }) {
      if (amount === 0) {
        return { reference: null, status: 'NOT_REQUIRED', last4: null, brand: null };
      }
      const res = await client.post(
        '/authorizations',
        {
          amount,
          currency,
          payment_token: paymentToken,
          reference: orderNumber,
          receipt_email: customerEmail,
          capture: false,
        },
        {
          headers: { 'Idempotency-Key': `auth-${orderNumber}` },
          retryable: true,
          expectedStatuses: [402],
        },
      );
      if (res.status === 402 || (res.data && res.data.status === 'declined')) throw toDecline(res.data);
      if (!res.data || !res.data.id) {
        throw new UpstreamError('payment-gateway', 'Authorization response missing reference.');
      }
      return {
        reference: res.data.id,
        status: 'AUTHORIZED',
        last4: res.data.card ? res.data.card.last4 : null,
        brand: res.data.card ? res.data.card.brand : null,
      };
    },

    /** Captures a previous authorisation (optionally partial). */
    async capture({ reference, amount, orderNumber }) {
      const res = await client.post(
        `/authorizations/${encodeURIComponent(reference)}/capture`,
        { amount },
        { headers: { 'Idempotency-Key': `capture-${orderNumber}` }, retryable: true },
      );
      return { reference, capturedAmount: res.data && Number.isInteger(res.data.amount_captured) ? res.data.amount_captured : amount };
    },

    /** Releases an uncaptured hold. */
    async void({ reference, orderNumber }) {
      await client.post(
        `/authorizations/${encodeURIComponent(reference)}/void`,
        {},
        { headers: { 'Idempotency-Key': `void-${orderNumber}` }, retryable: true },
      );
      return { reference, status: 'VOIDED' };
    },

    /** Refunds a captured amount (full or partial). */
    async refund({ reference, amount, orderNumber, reason }) {
      const res = await client.post(
        '/refunds',
        { authorization: reference, amount, reason },
        { headers: { 'Idempotency-Key': `refund-${orderNumber}-${amount}` }, retryable: true },
      );
      return { refundId: res.data ? res.data.id : null, amount };
    },
  };
}

module.exports = { createPaymentGatewayClient, DECLINE_MESSAGES };
```

## apps/ecom-gokinetic/server/src/integrations/serviceabilityApiClient.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/integrations/serviceabilityApiClient.js`.

```javascript
'use strict';

const { createHttpClient } = require('./httpClient');
const { UpstreamError } = require('../errors');

/**
 * Client for the network serviceability (address qualification) API.
 * Translates the upstream payload into the storefront's vocabulary so the
 * rest of the code never depends on upstream field names.
 */

const TECHNOLOGY_MAP = {
  GPON: 'FTTP',
  XGSPON: 'FTTP',
  VDSL: 'FTTC',
  FWA: 'FIXED_WIRELESS',
};

/**
 * @param {object} raw upstream response body
 * @returns {{serviceable: boolean, technology: string|null, maxDownloadMbps: number,
 *   maxUploadMbps: number, estimatedInstallDays: number|null, requiresSiteSurvey: boolean,
 *   reasonCode: string|null, upstreamReference: string|null}}
 */
function mapQualification(raw) {
  if (!raw || typeof raw !== 'object') {
    throw new UpstreamError('serviceability-api', 'Empty qualification response.');
  }
  const best = Array.isArray(raw.offers)
    ? raw.offers.reduce((top, offer) => (!top || offer.max_down_mbps > top.max_down_mbps ? offer : top), null)
    : null;
  const serviceable = raw.qualification === 'QUALIFIED' && Boolean(best);
  return {
    serviceable,
    technology: best ? TECHNOLOGY_MAP[best.technology] || null : null,
    maxDownloadMbps: best ? best.max_down_mbps : 0,
    maxUploadMbps: best ? best.max_up_mbps : 0,
    estimatedInstallDays: Number.isInteger(raw.lead_time_days) ? raw.lead_time_days : null,
    requiresSiteSurvey: Boolean(raw.site_survey_required),
    reasonCode: serviceable ? null : raw.reason_code || 'NOT_QUALIFIED',
    upstreamReference: raw.qualification_id || null,
  };
}

function createServiceabilityApiClient({ baseUrl, apiKey, timeoutMs, http } = {}) {
  const client =
    http ||
    createHttpClient({
      name: 'serviceability-api',
      baseUrl,
      timeoutMs,
      headers: { 'X-Api-Key': apiKey },
      maxRetries: 2,
    });

  return {
    /**
     * Qualifies a normalised address.
     * @param {{line1:string,line2:string,city:string,state:string,postalCode:string}} address
     */
    async qualify(address) {
      const res = await client.post(
        '/qualifications',
        {
          address: {
            street: address.line1,
            unit: address.line2 || undefined,
            city: address.city,
            state: address.state,
            zip: address.postalCode,
          },
        },
        { retryable: true, expectedStatuses: [404] },
      );
      if (res.status === 404) {
        return {
          serviceable: false,
          technology: null,
          maxDownloadMbps: 0,
          maxUploadMbps: 0,
          estimatedInstallDays: null,
          requiresSiteSurvey: false,
          reasonCode: 'ADDRESS_NOT_FOUND',
          upstreamReference: null,
        };
      }
      return mapQualification(res.data);
    },

    /** Requests the earliest install appointment slot for a qualified address. */
    async reserveInstallSlot({ upstreamReference, preferredDate, orderNumber }) {
      const res = await client.post(
        '/appointments',
        {
          qualification_id: upstreamReference,
          preferred_date: preferredDate ? preferredDate.toISOString().slice(0, 10) : undefined,
          external_reference: orderNumber,
        },
        { retryable: true, headers: { 'Idempotency-Key': `appt-${orderNumber}` } },
      );
      return {
        appointmentId: res.data ? res.data.appointment_id : null,
        scheduledFor: res.data && res.data.start ? new Date(res.data.start) : null,
      };
    },
  };
}

module.exports = { createServiceabilityApiClient, mapQualification };
```

## apps/ecom-gokinetic/server/src/jobs/index.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/jobs/index.js`.

```javascript
'use strict';

const { ORDER_STATUS, PAYMENT_STATUS } = require('../domain/constants');
const { createScheduler } = require('./scheduler');
const { logger } = require('../config/logger');

const HOUR_MS = 3600 * 1000;
const ORDER_BATCH_SIZE = 50;

/**
 * Validates SUBMITTED orders (re-qualify, capture, book install) and issues
 * the checkout invoice for every order whose payment is settled.
 */
function orderValidationJob({ orders, orderService, invoiceService, log = logger }) {
  return async () => {
    const submitted = await orders.findByStatus(ORDER_STATUS.SUBMITTED, { limit: ORDER_BATCH_SIZE });
    const outcomes = { PROVISIONING: 0, VALIDATED: 0, FAILED: 0, ERROR: 0 };
    for (const order of submitted) {
      try {
        const { outcome } = await orderService.processSubmitted(order);
        outcomes[outcome] += 1;
        if (outcome === 'FAILED') {
          await invoiceService.voidForOrder(order.orderNumber);
          continue;
        }
        const fresh = await orders.findByNumber(order.orderNumber);
        const settled = [PAYMENT_STATUS.CAPTURED, PAYMENT_STATUS.NOT_REQUIRED].includes(fresh.payment.status);
        if (settled) await invoiceService.issueInitial(fresh);
      } catch (err) {
        // Upstream outage: the order stays SUBMITTED and is retried next run.
        outcomes.ERROR += 1;
        log.warn('job.order_validation_error', { orderNumber: order.orderNumber, error: err.message });
      }
    }
    return { scanned: submitted.length, ...outcomes };
  };
}

/**
 * Expires stale carts and emails a one-time reminder to signed-in shoppers
 * who opted into marketing and left items behind.
 */
function abandonedCartJob({ carts, users, notifier, storefrontUrl, idleHours, now = () => new Date() }) {
  return async () => {
    const expired = await carts.expireStale(now());
    const idleSince = new Date(now().getTime() - idleHours * HOUR_MS);
    const candidates = await carts.findAbandoned({ idleSince });
    let reminded = 0;
    for (const cart of candidates) {
      const user = await users.findById(cart.userId);
      // Mark even when not sent so ineligible carts are not rescanned forever.
      await carts.markReminderSent(cart.id, now());
      if (!user || user.status !== 'ACTIVE' || !user.marketingOptIn) continue;
      const result = await notifier.send({
        template: 'ABANDONED_CART',
        to: user.email,
        reference: `cart:${cart.id}`,
        data: { firstName: user.firstName, cart, resumeUrl: `${storefrontUrl}/cart?resume=${cart.id}` },
        dedupe: true,
      });
      if (result.sent) reminded += 1;
    }
    return { expired, candidates: candidates.length, reminded };
  };
}

/**
 * Builds the scheduler with every background job registered.
 * @param {ReturnType<import('../container').createContainer>} container
 */
function buildScheduler(container) {
  const { config, repos, notifier, services } = container;
  const scheduler = createScheduler();
  scheduler.register(
    'order-validation',
    config.jobs.orderValidationIntervalMs,
    orderValidationJob({
      orders: repos.orders,
      orderService: services.orderService,
      invoiceService: services.invoiceService,
    }),
  );
  scheduler.register(
    'abandoned-cart',
    config.jobs.abandonedCartIntervalMs,
    abandonedCartJob({
      carts: repos.carts,
      users: repos.users,
      notifier,
      storefrontUrl: config.urls.storefront,
      idleHours: config.jobs.abandonedCartIdleHours,
    }),
  );
  scheduler.register('quote-expiry', config.jobs.quoteExpiryIntervalMs, async () => ({
    expired: await services.quoteService.expireDue(),
  }));
  scheduler.register('billing', config.jobs.billingIntervalMs, () => services.invoiceService.runBillingCycle());
  return scheduler;
}

module.exports = { buildScheduler, orderValidationJob, abandonedCartJob };
```

## apps/ecom-gokinetic/server/src/jobs/jobs.test.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/jobs/jobs.test.js`.

```javascript
'use strict';

const { createWorld, placeOrder, principals } = require('../../tests/support/world');
const { orderValidationJob, abandonedCartJob } = require('./index');
const { createScheduler } = require('./scheduler');

const silentLog = { info() {}, warn() {}, error() {}, debug() {} };

describe('orderValidationJob', () => {
  test('provisions submitted orders and issues their checkout invoice', async () => {
    const world = createWorld();
    const placed = await placeOrder(world, principals.consumer);
    const run = orderValidationJob({
      orders: world.repos.orders,
      orderService: world.services.orderService,
      invoiceService: world.services.invoiceService,
      log: silentLog,
    });
    const result = await run();
    expect(result).toMatchObject({ scanned: 1, PROVISIONING: 1, ERROR: 0 });
    expect(world.repos.invoices.rows).toEqual([expect.objectContaining({ orderNumber: placed.orderNumber, kind: 'INITIAL', status: 'PAID' })]);
  });

  test('upstream outages leave the order for the next run', async () => {
    const world = createWorld();
    await placeOrder(world, principals.consumer);
    world.api.qualify = async () => {
      throw Object.assign(new Error('serviceability-api timed out'), { status: 502 });
    };
    const run = orderValidationJob({
      orders: world.repos.orders,
      orderService: world.services.orderService,
      invoiceService: world.services.invoiceService,
      log: silentLog,
    });
    expect(await run()).toMatchObject({ ERROR: 1 });
    expect([...world.repos.orders.rows.values()][0].status).toBe('SUBMITTED');
  });
});

describe('abandonedCartJob', () => {
  const setup = async (marketingOptIn) => {
    const users = [{ id: 'u-consumer', email: 'ada@example.com', firstName: 'Ada', lastName: 'L', accountId: 'ACC-00000001', marketingOptIn }];
    const world = createWorld({ users });
    const { cart } = await world.services.cartService.create({ segment: 'CONSUMER' }, principals.consumer);
    await world.services.cartService.addItem(cart.id, { sku: 'GK-FIBRE-1000', quantity: 1 }, principals.consumer, null);
    world.repos.carts.rows.get(cart.id).updatedAt = new Date(Date.now() - 48 * 3600 * 1000);
    const run = abandonedCartJob({
      carts: world.repos.carts,
      users: world.repos.users,
      notifier: world.notifier,
      storefrontUrl: 'https://shop.example',
      idleHours: 24,
    });
    return { world, run, cartId: cart.id };
  };

  test('reminds opted-in shoppers once', async () => {
    const { world, run, cartId } = await setup(true);
    expect(await run()).toMatchObject({ candidates: 1, reminded: 1 });
    expect(world.notifier.sent[0].data.resumeUrl).toBe(`https://shop.example/cart?resume=${cartId}`);
    expect(await run()).toMatchObject({ candidates: 0, reminded: 0 });
  });

  test('never emails shoppers who opted out', async () => {
    const { world, run } = await setup(false);
    expect(await run()).toMatchObject({ candidates: 1, reminded: 0 });
    expect(world.notifier.sent).toHaveLength(0);
  });
});

describe('scheduler', () => {
  test('never overlaps a job with itself and records failures', async () => {
    const scheduler = createScheduler({ log: silentLog });
    let release;
    scheduler.register('slow', 1000, () => new Promise((resolve) => { release = resolve; }));
    scheduler.register('broken', 1000, async () => {
      throw new Error('boom');
    });

    const first = scheduler.runNow('slow');
    expect(await scheduler.runNow('slow')).toEqual({ skipped: true });
    release('done');
    expect(await first).toEqual({ skipped: false, result: 'done' });

    await scheduler.runNow('broken');
    expect(scheduler.status().find((j) => j.name === 'broken').lastError).toBe('boom');
  });

  test('rejects duplicate names and too-frequent intervals', () => {
    const scheduler = createScheduler({ log: silentLog });
    scheduler.register('a', 1000, async () => {});
    expect(() => scheduler.register('a', 1000, async () => {})).toThrow();
    expect(() => scheduler.register('b', 10, async () => {})).toThrow(RangeError);
  });
});
```

## apps/ecom-gokinetic/server/src/jobs/scheduler.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/jobs/scheduler.js`.

```javascript
'use strict';

const { logger, requestContext } = require('../config/logger');
const { generateCorrelationId } = require('../domain/identifiers');

/**
 * In-process interval scheduler for background jobs.
 *
 * - a job never overlaps itself: a tick is skipped while the previous run is
 *   still going (slow upstreams must not pile up concurrent runs)
 * - each run gets its own correlation id so its log lines (and outbound
 *   calls) can be traced like an HTTP request
 * - failures are logged and the job keeps its schedule
 *
 * With several API replicas each pod runs the jobs; every job is written to
 * be idempotent (compare-and-set transitions, unique invoice keys, email
 * de-duplication) so concurrent runs are safe, merely wasteful.
 */
function createScheduler({ log = logger, setIntervalFn = setInterval, clearIntervalFn = clearInterval } = {}) {
  const jobs = new Map();

  async function runJob(job) {
    if (job.running) {
      log.debug('job.skipped_overlap', { job: job.name });
      return { skipped: true };
    }
    job.running = true;
    const started = Date.now();
    const correlationId = `job-${job.name}-${generateCorrelationId()}`;
    try {
      const result = await requestContext.run({ correlationId }, () => job.run());
      job.lastRunAt = new Date();
      job.lastError = null;
      log.info('job.completed', { job: job.name, durationMs: Date.now() - started, result });
      return { skipped: false, result };
    } catch (err) {
      job.lastError = err.message;
      log.error('job.failed', { job: job.name, durationMs: Date.now() - started, error: err });
      return { skipped: false, error: err };
    } finally {
      job.running = false;
    }
  }

  return {
    /**
     * @param {string} name
     * @param {number} intervalMs
     * @param {() => Promise<unknown>} run
     */
    register(name, intervalMs, run) {
      if (jobs.has(name)) throw new Error(`Job ${name} already registered`);
      if (!Number.isInteger(intervalMs) || intervalMs < 1000) {
        throw new RangeError(`Job ${name} interval must be at least 1000ms`);
      }
      jobs.set(name, { name, intervalMs, run, timer: null, running: false, lastRunAt: null, lastError: null });
    },

    start() {
      for (const job of jobs.values()) {
        job.timer = setIntervalFn(() => {
          runJob(job);
        }, job.intervalMs);
        if (job.timer && job.timer.unref) job.timer.unref();
      }
      log.info('jobs.started', { jobs: [...jobs.keys()] });
    },

    stop() {
      for (const job of jobs.values()) {
        if (job.timer) clearIntervalFn(job.timer);
        job.timer = null;
      }
    },

    /** Runs a job immediately (ops endpoint / tests). */
    async runNow(name) {
      const job = jobs.get(name);
      if (!job) throw new RangeError(`Unknown job ${name}`);
      return runJob(job);
    },

    status() {
      return [...jobs.values()].map((j) => ({
        name: j.name,
        intervalMs: j.intervalMs,
        running: j.running,
        lastRunAt: j.lastRunAt ? j.lastRunAt.toISOString() : null,
        lastError: j.lastError,
      }));
    },
  };
}

module.exports = { createScheduler };
```

## apps/ecom-gokinetic/server/src/middleware/asyncHandler.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/asyncHandler.js`.

```javascript
'use strict';

/**
 * Wraps an async route handler so rejected promises reach the error handler.
 * @param {(req, res, next) => Promise<unknown>} fn
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
```

## apps/ecom-gokinetic/server/src/middleware/auth.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/auth.js`.

```javascript
'use strict';

const jwt = require('jsonwebtoken');
const { UnauthorizedError } = require('../errors');

/**
 * Bearer JWT authentication (OIDC-compatible claims).
 *
 * Expected claims: `sub` (user id), `acc` (account id), `roles` (array),
 * `seg` (CONSUMER|BUSINESS), `typ` = "access". Tokens are verified for
 * signature, issuer, audience and expiry.
 */

function extractBearer(req) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) return null;
  return token.trim();
}

function toPrincipal(claims) {
  return {
    id: claims.sub,
    accountId: claims.acc,
    roles: Array.isArray(claims.roles) ? claims.roles : [],
    segment: claims.seg,
    email: claims.email,
  };
}

function verifyAccessToken(token, authConfig) {
  let claims;
  try {
    claims = jwt.verify(token, authConfig.jwtSecret, {
      issuer: authConfig.issuer,
      audience: authConfig.audience,
      algorithms: ['HS256'],
    });
  } catch (err) {
    const detail = err.name === 'TokenExpiredError' ? 'Access token has expired.' : 'Access token is invalid.';
    throw new UnauthorizedError(detail);
  }
  if (claims.typ !== 'access') throw new UnauthorizedError('Token is not an access token.');
  return toPrincipal(claims);
}

/**
 * Requires a valid bearer token; populates `req.user`.
 * @param {object} authConfig config.auth
 */
function authenticate(authConfig) {
  return (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next(new UnauthorizedError());
    try {
      req.user = verifyAccessToken(token, authConfig);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

/**
 * Populates `req.user` when a valid token is present but lets anonymous
 * shoppers through (guest carts, catalogue browsing). An invalid token is
 * still rejected so clients notice expired sessions.
 */
function optionalAuthenticate(authConfig) {
  return (req, _res, next) => {
    const token = extractBearer(req);
    if (!token) return next();
    try {
      req.user = verifyAccessToken(token, authConfig);
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { authenticate, optionalAuthenticate, verifyAccessToken, extractBearer };
```

## apps/ecom-gokinetic/server/src/middleware/correlationId.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/correlationId.js`.

```javascript
'use strict';

const { requestContext } = require('../config/logger');
const { generateCorrelationId } = require('../domain/identifiers');

const HEADER = 'X-Correlation-Id';
const VALID_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Accepts an inbound `X-Correlation-Id` (if well-formed) or generates one,
 * echoes it on the response and binds it to the async context so the logger
 * and outbound HTTP clients pick it up automatically.
 */
function correlationId() {
  return (req, res, next) => {
    const inbound = req.get(HEADER);
    const id = inbound && VALID_ID.test(inbound) ? inbound : generateCorrelationId();
    req.correlationId = id;
    res.set(HEADER, id);
    requestContext.run({ correlationId: id }, () => next());
  };
}

module.exports = { correlationId, CORRELATION_HEADER: HEADER };
```

## apps/ecom-gokinetic/server/src/middleware/errorHandler.js

Application: eCom (GoKinetic, Business GoKinetic) storefront & checkout. Stack: MERN (MongoDB, Express, React, Node.js). Language: javascript. Path: `apps/ecom-gokinetic/server/src/middleware/errorHandler.js`.

```javascript
'use strict';

const { AppError, NotFoundError, PROBLEM_BASE } = require('../errors');
const { logger } = require('../config/logger');

const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/**
 * Translates library errors (Mongoose, body-parser, JWT) into AppErrors so
 * they render consistently.
 */
function normalizeError(err) {
  if (err instanceof AppError) return err;

  if (err && err.type === 'entity.parse.failed') {
    return new AppError({
      status: 400,
      type: 'malformed-json',
      title: 'Malformed JSON body',
      detail: 'The request body could not be parsed as JSON.',
    });
  }
  if (err && err.type === 'entity.too.large') {
    return new AppError({ status: 413, type: 'payload-too-large', title: 'Payload too large' });
  }
  if (err && err.name === 'CastError') {
    return new AppError({
      status: 400,
      type: 'invalid-identifier',
      title: 'Invalid identifier',
      detail: `Value for ${err.path} is not a valid identifier.`,
    });
  }
  if (err && err.name === 'ValidationError' && err.errors) {
    const errors = Object.values(err.errors).map((e) => ({ path: e.path, message: e.message }));
    return new AppError({
      status: 400,
      type: 'validation-error',
      title: 'Request validation failed',
      detail: 'One or more fields are invalid.',
      extensions: { errors },
    });
  }
  if (err && (err.code === 11000 || err.code === 11001)) {
    return new AppError({
      status: 409,
      type: 'conflict',
      title: 'Conflict',
      detail: 'A resource with the same unique key already exists.',
      extensions: { keys: Object.keys(err.keyValue || {}) },
    });
  }
  const internal = new AppError({
    status: 500,
    type: 'internal-error',
    title: 'Internal server error',
    detail: 'An unexpected error occurred. Quote the correlation id when contacting support.',
  });
  internal.expose = false;
  internal.cause = err;
  return internal;
}

/** Builds the RFC 7807 body for an AppError. */
function toProblem(appError, req) {
  return {
    type: appError.type,
    title: appError.title,
    status: appError.status,
    ...(appError.detail ? { detail: appError.detail } : {}),
    instance: req.originalUrl,
    correlationId: req.correlationId,
    ...appError.extensions,
  };
}

/** 404 for unmatched routes. */
function notFoundHandler(req, _res, next) {
  next(new NotFoundError('Route', `${req.method} ${req.path}`));
}

/** Final Express error middleware. */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, _next) {
  const appError = normalizeError(err);
  if (appError.status >= 500) {
    logger.error('http.unhandled_error', {
      path: req.originalUrl,
      method: req.method,
      error: appError.cause || err,
    });
  }
  if (res.headersSent) return res.end();
  return res.status(appError.status).type(PROBLEM_CONTENT_TYPE).send(JSON.stringify(toProblem(appError, req)));
}

module.exports = { errorHandler, notFoundHandler, normalizeError, toProblem, PROBLEM_CONTENT_TYPE, PROBLEM_BASE };
```
