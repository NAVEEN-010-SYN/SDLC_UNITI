'use strict';

const crypto = require('node:crypto');
const {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  BusinessRuleError,
} = require('../errors');
const { PRODUCT_TYPES, SEGMENTS } = require('../domain/constants');
const { priceItems } = require('../domain/pricing');
const { resolveTaxBps, toPricingLines, itemFromProduct, refreshItemPrices } = require('./pricingContext');
const rules = require('./cartRules');

const MAX_DISTINCT_ITEMS = 20;

/**
 * Shopping cart behaviour: bundle rules, serviceability gating, promo codes
 * and live repricing.
 *
 * Bundle rules
 *  - exactly zero or one PLAN line per cart; adding a new plan replaces it
 *  - consumer plans are quantity 1; business plans may cover several sites
 *  - add-ons flagged `requiresPlan` need a compatible plan in the cart and
 *    are removed automatically if the plan changes to an incompatible one
 *  - products must be sold in the cart's segment
 */
function createCartService({
  carts,
  products,
  accounts,
  serviceability,
  promoService,
  cartTtlHours = 72,
  now = () => new Date(),
}) {
  const expiry = () => new Date(now().getTime() + cartTtlHours * 3600000);

  /** Owned carts need the owner (or support); guest carts need their token. */
  function assertAccess(cart, principal, guestToken) {
    if (cart.userId) {
      if (principal && principal.id === cart.userId) return;
      if (principal && principal.roles.includes('SUPPORT_AGENT')) return;
      throw new ForbiddenError('This cart belongs to another user.');
    }
    if (!rules.tokensMatch(guestToken, cart.guestToken)) {
      throw new ForbiddenError('A valid cart token is required.');
    }
  }

  async function load(cartId, principal, guestToken) {
    const cart = await carts.findById(cartId);
    if (!cart) throw new NotFoundError('Cart', cartId);
    assertAccess(cart, principal, guestToken);
    if (cart.status !== 'OPEN') {
      throw new BusinessRuleError('CART_CLOSED', 'This cart has already been checked out or has expired.');
    }
    return cart;
  }

  async function save(cart, patch) {
    const updated = await carts.updateVersioned(cart.id, cart.version, { ...patch, expiresAt: expiry() });
    if (!updated) {
      throw new ConflictError('The cart was changed in another window. Refresh and try again.', {
        code: 'CART_VERSION_CONFLICT',
      });
    }
    return updated;
  }

  async function catalogueFor(items) {
    const list = await products.findActiveBySkus(items.map((i) => i.sku));
    return new Map(list.map((p) => [p.sku, p]));
  }

  /**
   * Builds the full cart view: refreshed prices, pricing breakdown and any
   * warnings (price changes, promo no longer valid, plan unavailable).
   */
  async function view(cart) {
    const catalogue = await catalogueFor(cart.items);
    const { items, warnings } = refreshItemPrices(cart.items, catalogue);
    const account = cart.accountId ? await accounts.findByAccountId(cart.accountId) : null;

    const promoDescriptor = await evaluateCartPromo(cart, items, warnings);
    warnings.push(...rules.serviceabilityWarnings(cart.serviceability, items));

    const pricing = priceItems({
      lines: toPricingLines(items),
      contractTermMonths: cart.contractTermMonths,
      segment: cart.segment,
      promo: promoDescriptor,
      taxBps: resolveTaxBps(cart.serviceAddress, account),
    });

    return {
      id: cart.id,
      segment: cart.segment,
      version: cart.version,
      status: cart.status,
      items,
      contractTermMonths: cart.contractTermMonths,
      serviceAddress: cart.serviceAddress,
      serviceability: cart.serviceability,
      promoCode: cart.promoCode,
      pricing,
      warnings,
      readyForCheckout: rules.isReady(cart, items, warnings),
      expiresAt: cart.expiresAt,
    };
  }

  /** Re-evaluates the cart promo; returns its descriptor or adds a warning. */
  async function evaluateCartPromo(cart, items, warnings) {
    if (!cart.promoCode) return null;
    const evaluation = await promoService.evaluate(cart.promoCode, {
      segment: cart.segment,
      accountId: cart.accountId,
      skus: items.map((i) => i.sku),
      monthlySubtotal: rules.monthlySubtotal(items),
      contractTermMonths: cart.contractTermMonths,
    });
    if (evaluation.ok) return evaluation.descriptor;
    warnings.push({ code: evaluation.code, message: evaluation.message, promoCode: cart.promoCode });
    return null;
  }

  /** Prunes incompatible add-ons and saves the new item list. */
  async function saveItems(cart, items) {
    const catalogue = await catalogueFor(items);
    const pruned = rules.pruneIncompatible(items, catalogue);
    const saved = await save(cart, { items: pruned.items });
    return { saved, removed: pruned.removed };
  }

  return {
    view,

    async create({ segment }, principal) {
      if (principal && principal.segment && principal.segment !== segment) {
        throw new BusinessRuleError('SEGMENT_MISMATCH', `Your login is for the ${principal.segment} storefront.`);
      }
      if (principal) {
        const open = await carts.findOpenByUser(principal.id);
        if (open && open.segment === segment) return { cart: await view(open), guestToken: null };
      }
      const guestToken = principal ? null : crypto.randomBytes(24).toString('hex');
      const cart = await carts.create({
        segment,
        userId: principal ? principal.id : null,
        accountId: principal ? principal.accountId : null,
        guestToken,
        items: [],
        contractTermMonths: segment === SEGMENTS.BUSINESS ? 36 : 12,
        expiresAt: expiry(),
      });
      return { cart: await view(cart), guestToken };
    },

    async get(cartId, principal, guestToken) {
      return view(await load(cartId, principal, guestToken));
    },

    async addItem(cartId, { sku, quantity }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const product = await products.findBySku(sku);
      if (!product || !product.active) throw new NotFoundError('Product', sku);
      if (!product.segments.includes(cart.segment)) {
        throw new BusinessRuleError('PRODUCT_NOT_IN_SEGMENT', `${product.name} is not sold on this storefront.`);
      }

      let items = [...cart.items];
      const existing = items.find((i) => i.sku === sku);
      const newQuantity = (existing ? existing.quantity : 0) + quantity;

      if (product.type === PRODUCT_TYPES.PLAN) {
        rules.assertPlanAllowed(cart, product, sku, newQuantity);
        items = items.filter((i) => i.productType !== PRODUCT_TYPES.PLAN || i.sku === sku);
      } else if (product.requiresPlan) {
        rules.assertAddonAllowed(items, product);
      }
      rules.assertQuantityAllowed(product, newQuantity);

      if (existing) {
        items = items.map((i) => (i.sku === sku ? { ...itemFromProduct(product, newQuantity), addedAt: i.addedAt } : i));
      } else {
        if (items.length >= MAX_DISTINCT_ITEMS) {
          throw new BusinessRuleError('CART_FULL', `A cart can hold at most ${MAX_DISTINCT_ITEMS} different items.`);
        }
        items.push({ ...itemFromProduct(product, quantity), addedAt: now() });
      }

      const { saved, removed } = await saveItems(cart, items);
      const result = await view(saved);
      if (removed.length) {
        result.warnings.push({ code: 'ADDONS_REMOVED', skus: removed, message: 'Some add-ons were removed because they do not work with the new plan.' });
      }
      return result;
    },

    async updateItem(cartId, sku, { quantity }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const item = cart.items.find((i) => i.sku === sku);
      if (!item) throw new NotFoundError('Cart item', sku);

      let items;
      if (quantity === 0) {
        items = cart.items.filter((i) => i.sku !== sku);
      } else {
        const product = await products.findBySku(sku);
        if (product && quantity > product.maxQuantity) {
          throw new BusinessRuleError('MAX_QUANTITY_EXCEEDED', `You can order at most ${product.maxQuantity}.`);
        }
        if (item.productType === PRODUCT_TYPES.PLAN && cart.segment === SEGMENTS.CONSUMER && quantity > 1) {
          throw new BusinessRuleError('PLAN_QUANTITY_LIMIT', 'Consumer orders include a single broadband plan.');
        }
        items = cart.items.map((i) => (i.sku === sku ? { ...i, quantity } : i));
      }
      const { saved } = await saveItems(cart, items);
      return view(saved);
    },

    async setContractTerm(cartId, { contractTermMonths }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      if (cart.segment === SEGMENTS.BUSINESS && contractTermMonths === 0) {
        throw new BusinessRuleError('TERM_REQUIRED', 'Business plans require a 12, 24 or 36 month term.');
      }
      return view(await save(cart, { contractTermMonths }));
    },

    /** Sets the service address and stores a serviceability snapshot. */
    async setServiceAddress(cartId, { address }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const check = await serviceability.check(address, { segment: cart.segment });
      const snapshot = {
        checkId: check.checkId,
        serviceable: check.serviceable,
        maxSpeedMbps: check.maxDownloadMbps,
        availablePlanSkus: check.availablePlanSkus,
        checkedAt: now(),
      };
      return view(await save(cart, { serviceAddress: check.address, serviceability: snapshot }));
    },

    async applyPromo(cartId, { code }, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      const evaluation = await promoService.evaluate(code, {
        segment: cart.segment,
        accountId: cart.accountId,
        skus: cart.items.map((i) => i.sku),
        monthlySubtotal: rules.monthlySubtotal(cart.items),
        contractTermMonths: cart.contractTermMonths,
      });
      if (!evaluation.ok) throw new BusinessRuleError(evaluation.code, evaluation.message);
      return view(await save(cart, { promoCode: evaluation.promo.code }));
    },

    async removePromo(cartId, principal, guestToken) {
      const cart = await load(cartId, principal, guestToken);
      return view(await save(cart, { promoCode: null }));
    },

    /**
     * Attaches a guest cart to the signed-in user. If the user already has an
     * open cart in the same segment the guest items are merged into it.
     */
    async claim(cartId, guestToken, principal) {
      const guest = await carts.findById(cartId);
      if (!guest || guest.status !== 'OPEN') throw new NotFoundError('Cart', cartId);
      if (guest.userId) {
        if (guest.userId === principal.id) return view(guest);
        throw new ForbiddenError('This cart belongs to another user.');
      }
      if (!rules.tokensMatch(guestToken, guest.guestToken)) throw new ForbiddenError('A valid cart token is required.');

      const existing = await carts.findOpenByUser(principal.id);
      if (existing && existing.segment === guest.segment) {
        const merged = rules.mergeGuestItems(existing.items, guest.items);
        await carts.updateVersioned(guest.id, guest.version, { status: 'ABANDONED' });
        const saved = await save(existing, {
          items: merged,
          serviceAddress: guest.serviceAddress || existing.serviceAddress,
          serviceability: guest.serviceability || existing.serviceability,
          promoCode: guest.promoCode || existing.promoCode,
        });
        return view(saved);
      }
      return view(
        await save(guest, { userId: principal.id, accountId: principal.accountId, guestToken: null }),
      );
    },

    async markCheckedOut(cartId) {
      await carts.markCheckedOut(cartId);
    },

    /** Loads an open cart for checkout, enforcing ownership. */
    async loadForCheckout(cartId, principal) {
      const cart = await load(cartId, principal, null);
      if (!cart.userId || cart.userId !== principal.id) {
        throw new ForbiddenError('Sign in and claim the cart before checking out.');
      }
      return cart;
    },
  };
}

module.exports = { createCartService, MAX_DISTINCT_ITEMS };
