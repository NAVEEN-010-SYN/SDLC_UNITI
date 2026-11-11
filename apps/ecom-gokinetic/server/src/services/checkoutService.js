'use strict';

const { BusinessRuleError, PaymentDeclinedError } = require('../errors');
const { ORDER_STATUS, PAYMENT_STATUS, PRODUCT_TYPES } = require('../domain/constants');
const { orderStateMachine } = require('../domain/stateMachine');
const { generateOrderNumber } = require('../domain/identifiers');
const { logger } = require('../config/logger');

const BLOCKING_WARNINGS = new Set([
  'ADDRESS_NOT_SERVICEABLE',
  'PLAN_NOT_AVAILABLE_AT_ADDRESS',
  'ITEM_UNAVAILABLE',
]);

/**
 * Turns an open cart into a SUBMITTED order.
 *
 * The saga, with compensation on failure:
 *   1. re-price the cart and refuse if anything blocks checkout
 *   2. re-confirm serviceability (refreshing an expired check)
 *   3. reserve hardware stock                    -> release on failure
 *   4. persist the order as DRAFT
 *   5. authorise the due-today amount            -> cancel order on decline
 *   6. redeem the promo code                     -> void auth on failure
 *   7. DRAFT -> SUBMITTED, close the cart, send confirmation
 */
function createCheckoutService({
  cartService,
  serviceability,
  products,
  orders,
  promoService,
  paymentGateway,
  notifier,
  now = () => new Date(),
  log = logger,
}) {
  async function reserveHardware(items) {
    const reserved = [];
    for (const item of items.filter((i) => i.productType === PRODUCT_TYPES.HARDWARE)) {
      const ok = await products.reserveStock(item.sku, item.quantity);
      if (!ok) {
        await releaseHardware(reserved);
        throw new BusinessRuleError('OUT_OF_STOCK', `${item.name} sold out while you were checking out.`, { sku: item.sku });
      }
      reserved.push(item);
    }
    return reserved;
  }

  async function releaseHardware(items) {
    await Promise.all(items.map((i) => products.releaseStock(i.sku, i.quantity)));
  }

  async function confirmServiceability(cart) {
    let check = await serviceability.getCheck(cart.serviceability.checkId, { segment: cart.segment });
    if (serviceability.isExpired(check)) {
      check = await serviceability.check(cart.serviceAddress, { segment: cart.segment, forceRefresh: true });
    }
    const planSkus = cart.items.filter((i) => i.productType === PRODUCT_TYPES.PLAN).map((i) => i.sku);
    serviceability.assertPlansDeliverable(check, planSkus);
    return check;
  }

  async function cancelDraft(order, reason) {
    const entry = orderStateMachine.transition(order, ORDER_STATUS.CANCELLED, { reason, at: now() });
    await orders.transition(order.orderNumber, ORDER_STATUS.DRAFT, entry, { cancellationReason: reason });
  }

  return {
    /**
     * @param {object} principal authenticated user
     * @param {object} input validated checkout body
     * @returns {Promise<object>} the submitted order
     */
    async placeOrder(principal, input) {
      const cart = await cartService.loadForCheckout(input.cartId, principal);
      const view = await cartService.view(cart);

      if (!view.items.some((i) => i.productType === PRODUCT_TYPES.PLAN)) {
        throw new BusinessRuleError('PLAN_REQUIRED', 'Add a broadband plan to your cart before checking out.');
      }
      if (!cart.serviceAddress || !cart.serviceability) {
        throw new BusinessRuleError('SERVICE_ADDRESS_REQUIRED', 'Check your address before checking out.');
      }
      const blocking = view.warnings.filter((w) => BLOCKING_WARNINGS.has(w.code));
      if (blocking.length) {
        throw new BusinessRuleError(blocking[0].code, blocking[0].message, { warnings: blocking });
      }
      const promoProblem = view.warnings.find((w) => w.promoCode);
      if (promoProblem) {
        throw new BusinessRuleError(promoProblem.code, `${promoProblem.message} Remove the code to continue.`);
      }

      const check = await confirmServiceability({ ...cart, items: view.items });
      const reserved = await reserveHardware(view.items);

      const orderNumber = generateOrderNumber(now());
      const pricing = view.pricing;
      let order;
      try {
        order = await orders.create({
          orderNumber,
          accountId: principal.accountId,
          userId: principal.id,
          segment: cart.segment,
          status: ORDER_STATUS.DRAFT,
          statusHistory: [{ from: null, to: ORDER_STATUS.DRAFT, at: now(), actor: principal.id }],
          items: view.items.map(({ addedAt, ...item }) => item),
          contractTermMonths: cart.contractTermMonths,
          serviceAddress: cart.serviceAddress,
          billingAddress: input.billingAddress || cart.serviceAddress,
          contact: input.contact,
          promoCode: pricing.promo && pricing.promo.applied ? cart.promoCode : null,
          pricing,
          currency: pricing.currency,
          dueToday: pricing.dueToday,
          monthlyRecurring: pricing.recurring.total,
          preferredInstallDate: input.preferredInstallDate || null,
          serviceabilityCheckId: check.checkId,
          cartId: cart.id,
          payment: { status: PAYMENT_STATUS.PENDING },
        });
      } catch (err) {
        await releaseHardware(reserved);
        throw err;
      }

      let authorization;
      try {
        authorization = await paymentGateway.authorize({
          orderNumber,
          amount: pricing.dueToday,
          currency: pricing.currency,
          paymentToken: input.paymentToken,
          customerEmail: input.contact.email,
        });
      } catch (err) {
        await releaseHardware(reserved);
        const reason = err instanceof PaymentDeclinedError ? 'Payment declined' : 'Payment authorisation failed';
        await cancelDraft(order, reason);
        await orders.updatePayment(orderNumber, {
          status: PAYMENT_STATUS.FAILED,
          failureCode: err.extensions && err.extensions.declineCode ? err.extensions.declineCode : 'GATEWAY_ERROR',
        });
        log.warn('checkout.payment_failed', { orderNumber, reason });
        throw err;
      }

      if (order.promoCode) {
        try {
          await promoService.redeem({
            code: order.promoCode,
            accountId: principal.accountId,
            orderNumber,
            discountValue: pricing.promo.totalValue,
          });
        } catch (err) {
          if (authorization.reference) {
            await paymentGateway.void({ reference: authorization.reference, orderNumber }).catch(() => {});
          }
          await releaseHardware(reserved);
          await cancelDraft(order, 'Promo code could not be redeemed');
          throw err;
        }
      }

      const entry = orderStateMachine.transition(order, ORDER_STATUS.SUBMITTED, { actor: principal.id, at: now() });
      const submitted = await orders.transition(orderNumber, ORDER_STATUS.DRAFT, entry, {
        submittedAt: now(),
        payment: {
          status: authorization.status === 'NOT_REQUIRED' ? PAYMENT_STATUS.NOT_REQUIRED : PAYMENT_STATUS.AUTHORIZED,
          gatewayReference: authorization.reference,
          authorizedAmount: pricing.dueToday,
          capturedAmount: 0,
          refundedAmount: 0,
          last4: authorization.last4,
          brand: authorization.brand,
          failureCode: null,
        },
      });
      await cartService.markCheckedOut(cart.id);
      log.info('checkout.order_submitted', { orderNumber, dueToday: pricing.dueToday, segment: cart.segment });

      await notifier.send({
        template: 'ORDER_CONFIRMATION',
        to: submitted.contact.email,
        reference: orderNumber,
        data: { order: submitted },
        dedupe: true,
      });
      return submitted;
    },
  };
}

module.exports = { createCheckoutService };
