'use strict';

/**
 * Promotion step of the pricing engine (step 4). Mutates priced lines with
 * promo amounts and returns a promo summary. Pure functions, minor units.
 */

const { applyBps, allocate } = require('./money');
const { PROMO_KINDS, PROMO_SCOPES } = require('./constants');

function isEligible(promo, line) {
  if (!promo.eligibleSkus || promo.eligibleSkus.length === 0) return true;
  return promo.eligibleSkus.includes(line.sku);
}

function scopeIncludes(scope, part) {
  const effective = scope || PROMO_SCOPES.ALL;
  return effective === PROMO_SCOPES.ALL || effective === part;
}

function sum(values) {
  let result = 0;
  for (const value of values) result += value;
  return result;
}

function sumField(lines, key) {
  let result = 0;
  for (const line of lines) result += line[key];
  return result;
}

/**
 * Distributes a discount total across lines, never exceeding each line base.
 * @param {number} total
 * @param {number[]} bases
 */
function spreadCapped(total, bases) {
  const capped = Math.min(total, sum(bases));
  return allocate(capped, bases);
}

/** Percentage of each base, or zeros when the scope does not apply. */
function percentParts(bases, bps, inScope) {
  const parts = [];
  for (const base of bases) {
    if (inScope) parts.push(applyBps({ amount: base, currency: 'USD' }, bps).amount);
    else parts.push(0);
  }
  return parts;
}

function applyPercentOff(promo, eligible, recurringBases, oneTimeBases) {
  const bps = promo.valueBps || 0;
  let recurring = percentParts(recurringBases, bps, scopeIncludes(promo.scope, PROMO_SCOPES.RECURRING));
  let oneTime = percentParts(oneTimeBases, bps, scopeIncludes(promo.scope, PROMO_SCOPES.ONE_TIME));
  const cap = promo.maxDiscountAmount;
  const combined = [...recurring, ...oneTime];
  if (cap && sum(combined) > cap) {
    const scaled = allocate(cap, combined);
    recurring = scaled.slice(0, recurring.length);
    oneTime = scaled.slice(recurring.length);
  }
  eligible.forEach((line, i) => {
    line.recurringPromo = recurring[i];
    line.oneTimePromo = oneTime[i];
  });
}

/** ALL scope: consume one-time charges first, then the remainder comes off the first recurring month. */
function applyFixedOff(promo, eligible, recurringBases, oneTimeBases) {
  let remaining = promo.valueAmount || 0;
  if (scopeIncludes(promo.scope, PROMO_SCOPES.ONE_TIME)) {
    const parts = spreadCapped(remaining, oneTimeBases);
    eligible.forEach((line, i) => {
      line.oneTimePromo = parts[i];
    });
    remaining -= sum(parts);
  }
  if (remaining > 0 && scopeIncludes(promo.scope, PROMO_SCOPES.RECURRING)) {
    const parts = spreadCapped(remaining, recurringBases);
    eligible.forEach((line, i) => {
      line.recurringPromo = parts[i];
    });
  }
}

/** Applies the promo kind to the eligible lines; returns free months granted. */
function applyPromoKind(promo, eligible) {
  const recurringBases = eligible.map((l) => l.monthlyNet);
  const oneTimeBases = eligible.map((l) => l.hardware + l.installationNet);

  if (promo.kind === PROMO_KINDS.PERCENT_OFF) {
    applyPercentOff(promo, eligible, recurringBases, oneTimeBases);
    return 0;
  }
  if (promo.kind === PROMO_KINDS.FIXED_OFF) {
    applyFixedOff(promo, eligible, recurringBases, oneTimeBases);
    return 0;
  }
  if (promo.kind === PROMO_KINDS.FREE_INSTALLATION) {
    for (const line of eligible) line.oneTimePromo = line.installationNet;
    return 0;
  }
  if (promo.kind === PROMO_KINDS.FREE_MONTHS) {
    for (const line of eligible) line.introCredit = line.monthlyNet;
    return promo.freeMonths || 1;
  }
  throw new RangeError(`Unknown promo kind ${promo.kind}`);
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

  summary.freeMonths = applyPromoKind(promo, eligible);
  summary.recurringDiscount = sumField(eligible, 'recurringPromo');
  summary.oneTimeDiscount = sumField(eligible, 'oneTimePromo');
  const introValue = sumField(eligible, 'introCredit') * summary.freeMonths;
  summary.applied = summary.recurringDiscount + summary.oneTimeDiscount + introValue > 0;
  summary.totalValue =
    summary.oneTimeDiscount + summary.recurringDiscount * (promo.durationMonths || 1) + introValue;
  if (!summary.applied) summary.reason = 'NOTHING_TO_DISCOUNT';
  return summary;
}

module.exports = { applyPromo, isEligible, scopeIncludes, spreadCapped };
