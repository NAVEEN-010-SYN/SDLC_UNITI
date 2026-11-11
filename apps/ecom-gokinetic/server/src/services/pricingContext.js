'use strict';

const { STATE_TAX_BPS, DEFAULT_TAX_BPS } = require('../domain/constants');

/**
 * Glue between persisted line items and the pure pricing engine.
 */

/**
 * Resolves the tax rate for a service address.
 * @param {{state?: string}|null} address
 * @param {{taxExempt?: boolean}} [account]
 */
function resolveTaxBps(address, account) {
  if (account && account.taxExempt) return 0;
  if (!address || !address.state) return DEFAULT_TAX_BPS;
  return STATE_TAX_BPS[address.state.toUpperCase()] ?? DEFAULT_TAX_BPS;
}

/** Maps cart/order/quote items into pricing engine lines. */
function toPricingLines(items) {
  return items.map((item) => ({
    sku: item.sku,
    productType: item.productType,
    quantity: item.quantity,
    unitMonthly: item.unitMonthly,
    unitOneTime: item.unitOneTime,
    unitInstallation: item.unitInstallation,
  }));
}

/** Snapshot of a catalogue product as a line item at today's price. */
function itemFromProduct(product, quantity) {
  return {
    sku: product.sku,
    name: product.name,
    productType: product.type,
    quantity,
    unitMonthly: product.monthlyPrice,
    unitOneTime: product.oneTimePrice,
    unitInstallation: product.installationFee,
  };
}

/**
 * Re-applies catalogue prices to stored items and reports which changed or
 * disappeared since they were added.
 * @param {object[]} items stored items
 * @param {Map<string, object>} productsBySku current active catalogue
 */
function refreshItemPrices(items, productsBySku) {
  const refreshed = [];
  const warnings = [];
  for (const item of items) {
    const product = productsBySku.get(item.sku);
    if (!product) {
      warnings.push({ code: 'ITEM_UNAVAILABLE', sku: item.sku, message: `${item.name} is no longer available and was removed.` });
      continue;
    }
    const next = itemFromProduct(product, item.quantity);
    if (
      next.unitMonthly !== item.unitMonthly ||
      next.unitOneTime !== item.unitOneTime ||
      next.unitInstallation !== item.unitInstallation
    ) {
      warnings.push({
        code: 'PRICE_CHANGED',
        sku: item.sku,
        message: `The price of ${item.name} has changed.`,
        previous: { unitMonthly: item.unitMonthly, unitOneTime: item.unitOneTime },
        current: { unitMonthly: next.unitMonthly, unitOneTime: next.unitOneTime },
      });
    }
    refreshed.push({ ...next, addedAt: item.addedAt });
  }
  return { items: refreshed, warnings };
}

module.exports = { resolveTaxBps, toPricingLines, itemFromProduct, refreshItemPrices };
