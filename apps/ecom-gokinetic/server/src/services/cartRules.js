'use strict';

const crypto = require('node:crypto');
const { BusinessRuleError } = require('../errors');
const { PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');

const BLOCKING_WARNINGS = ['ADDRESS_NOT_SERVICEABLE', 'PLAN_NOT_AVAILABLE_AT_ADDRESS', 'ITEM_UNAVAILABLE'];

function tokensMatch(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function findPlan(items) {
  return items.find((i) => i.productType === PRODUCT_TYPES.PLAN);
}

function monthlySubtotal(items) {
  let subtotal = 0;
  for (const item of items) subtotal += item.unitMonthly * item.quantity;
  return subtotal;
}

/** Removes add-ons that are incompatible with the plan currently in `items`. */
function pruneIncompatible(items, productsBySku) {
  const plan = findPlan(items);
  const removed = [];
  const kept = [];
  for (const item of items) {
    const product = productsBySku.get(item.sku);
    if (!product || !product.requiresPlan) {
      kept.push(item);
      continue;
    }
    const anyPlan = product.compatiblePlanSkus.length === 0;
    const compatible = plan && (anyPlan || product.compatiblePlanSkus.includes(plan.sku));
    if (compatible) kept.push(item);
    else removed.push(item.sku);
  }
  return { items: kept, removed };
}

/** Serviceability warnings for the plans in the cart. */
function serviceabilityWarnings(serviceability, items) {
  if (!serviceability) return [];
  if (!serviceability.serviceable) {
    return [{ code: 'ADDRESS_NOT_SERVICEABLE', message: 'Fibre is not available at the service address.' }];
  }
  const blocked = [];
  for (const item of items) {
    if (item.productType !== PRODUCT_TYPES.PLAN) continue;
    if (!serviceability.availablePlanSkus.includes(item.sku)) blocked.push(item.sku);
  }
  if (blocked.length === 0) return [];
  return [
    { code: 'PLAN_NOT_AVAILABLE_AT_ADDRESS', skus: blocked, message: 'The selected plan is not available at this address.' },
  ];
}

function isReady(cart, items, warnings) {
  const hasPlan = Boolean(findPlan(items));
  const blocking = warnings.some((w) => BLOCKING_WARNINGS.includes(w.code));
  return hasPlan && Boolean(cart.serviceability) && !blocking;
}

/** Plan rules for addItem: consumer quantity limit and address availability. */
function assertPlanAllowed(cart, product, sku, newQuantity) {
  if (cart.segment === SEGMENTS.CONSUMER && newQuantity > 1) {
    throw new BusinessRuleError('PLAN_QUANTITY_LIMIT', 'Consumer orders include a single broadband plan.');
  }
  if (cart.serviceability && !cart.serviceability.availablePlanSkus.includes(sku)) {
    throw new BusinessRuleError(
      'PLAN_NOT_AVAILABLE_AT_ADDRESS',
      `${product.name} is not available at your address (max ${cart.serviceability.maxSpeedMbps} Mbps).`,
    );
  }
}

/** Add-on rules for addItem: a compatible plan must already be in the cart. */
function assertAddonAllowed(items, product) {
  const plan = findPlan(items);
  if (!plan) throw new BusinessRuleError('PLAN_REQUIRED', `Add a broadband plan before adding ${product.name}.`);
  if (product.compatiblePlanSkus.length && !product.compatiblePlanSkus.includes(plan.sku)) {
    throw new BusinessRuleError('ADDON_INCOMPATIBLE', `${product.name} is not compatible with ${plan.name}.`);
  }
}

/** Quantity and stock limits for addItem. */
function assertQuantityAllowed(product, newQuantity) {
  if (newQuantity > product.maxQuantity) {
    throw new BusinessRuleError('MAX_QUANTITY_EXCEEDED', `You can order at most ${product.maxQuantity} of ${product.name}.`, {
      maxQuantity: product.maxQuantity,
    });
  }
  if (product.stockOnHand != null && product.stockOnHand < newQuantity) {
    throw new BusinessRuleError('OUT_OF_STOCK', `${product.name} is out of stock.`, { available: product.stockOnHand });
  }
}

/** Merges guest items into an existing cart; a guest plan replaces the existing plan. */
function mergeGuestItems(existingItems, guestItems) {
  let merged = [...existingItems];
  for (const item of guestItems) {
    if (item.productType === PRODUCT_TYPES.PLAN) {
      merged = merged.filter((i) => i.productType !== PRODUCT_TYPES.PLAN);
      merged.push(item);
    } else if (!merged.some((i) => i.sku === item.sku)) {
      merged.push(item);
    }
  }
  return merged;
}

module.exports = {
  tokensMatch,
  findPlan,
  monthlySubtotal,
  pruneIncompatible,
  serviceabilityWarnings,
  isReady,
  assertPlanAllowed,
  assertAddonAllowed,
  assertQuantityAllowed,
  mergeGuestItems,
};
