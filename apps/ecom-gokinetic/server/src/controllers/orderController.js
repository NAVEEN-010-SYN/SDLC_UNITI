'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');
const { ORDER_STATUS } = require('../domain/constants');

const EXIT_STATUSES = new Set([ORDER_STATUS.CANCELLED, ORDER_STATUS.FAILED]);

/**
 * Checkout and order endpoints. Placing an order first vets the preferred
 * installation date against the cart's serviceability check, then hands the
 * cart to the checkout saga.
 */
function createOrderController({ cartService, checkoutService, orderService, invoiceService, installScheduling }) {
  return {
    placeOrder: asyncHandler(async (req, res) => {
      const cart = await cartService.loadForCheckout(req.body.cartId, req.user);
      if (cart.serviceability && cart.serviceability.checkId) {
        await installScheduling.assertPreferredDate(cart.serviceability.checkId, req.body.preferredInstallDate);
      }
      const order = await checkoutService.placeOrder(req.user, req.body);
      res.status(201).location(`/api/v1/orders/${order.orderNumber}`).json(order);
    }),

    list: asyncHandler(async (req, res) => {
      res.json(await orderService.list(req.user, req.validatedQuery));
    }),

    get: asyncHandler(async (req, res) => {
      res.json(await orderService.get(req.user, req.params.orderNumber));
    }),

    track: asyncHandler(async (req, res) => {
      res.json(await orderService.track(req.user, req.params.orderNumber));
    }),

    cancel: asyncHandler(async (req, res) => {
      const order = await orderService.cancel(req.user, req.params.orderNumber, req.body);
      await invoiceService.voidForOrder(order.orderNumber);
      res.json(order);
    }),

    advance: asyncHandler(async (req, res) => {
      const order = await orderService.advance(req.user, req.params.orderNumber, req.body);
      if (EXIT_STATUSES.has(order.status)) await invoiceService.voidForOrder(order.orderNumber);
      res.json(order);
    }),
  };
}

module.exports = { createOrderController };
