'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { idempotency } = require('../middleware/idempotency');

/**
 * Cart, checkout, order and quote routes.
 */
function cartRoutes({ controllers, guards }) {
  const router = express.Router();
  const { cart: c } = controllers;
  const cartId = validate(schemas.cart.cartIdParam, 'params');
  const item = validate(schemas.cart.itemParam, 'params');

  // Every cart route accepts guests; the service enforces token/ownership.
  router.use(guards.optional);
  router.post('/', validate(schemas.cart.create), c.create);
  router.get('/:cartId', cartId, c.get);
  router.post('/:cartId/items', cartId, validate(schemas.cart.addItem), c.addItem);
  router.patch('/:cartId/items/:sku', item, validate(schemas.cart.updateItem), c.updateItem);
  router.delete('/:cartId/items/:sku', item, c.removeItem);
  router.put('/:cartId/term', cartId, validate(schemas.cart.setTerm), c.setTerm);
  router.put('/:cartId/address', cartId, validate(schemas.cart.setAddress), c.setAddress);
  router.put('/:cartId/promo', cartId, validate(schemas.cart.applyPromo), c.applyPromo);
  router.delete('/:cartId/promo', cartId, c.removePromo);
  router.post('/:cartId/claim', guards.authenticated, cartId, c.claim);
  return router;
}

function checkoutRoutes({ controllers, guards, idempotencyStore }) {
  const router = express.Router();
  router.post(
    '/orders',
    guards.authenticated,
    requirePermission('order:place'),
    idempotency(idempotencyStore),
    validate(schemas.checkout.placeOrder),
    controllers.order.placeOrder,
  );
  return router;
}

function orderRoutes({ controllers, guards }) {
  const router = express.Router();
  const { order: c } = controllers;
  const orderNumber = validate(schemas.orders.orderNumberParam, 'params');
  const read = requirePermission('order:read:own', 'order:read:any');

  router.use(guards.authenticated);
  router.get('/', read, validate(schemas.orders.list, 'query'), c.list);
  router.get('/:orderNumber', read, orderNumber, c.get);
  router.get('/:orderNumber/tracking', read, orderNumber, c.track);
  router.post(
    '/:orderNumber/cancel',
    requirePermission('order:cancel:own', 'order:advance'),
    orderNumber,
    validate(schemas.orders.cancel),
    c.cancel,
  );
  router.post('/:orderNumber/status', requirePermission('order:advance'), orderNumber, validate(schemas.orders.advance), c.advance);
  return router;
}

function quoteRoutes({ controllers, guards, idempotencyStore }) {
  const router = express.Router();
  const { quote: c } = controllers;
  const quoteNumber = validate(schemas.quotes.quoteNumberParam, 'params');
  const read = requirePermission('quote:read:own', 'quote:read:any');
  const agent = requirePermission('quote:price');

  router.use(guards.authenticated);
  router.post('/', requirePermission('quote:request'), validate(schemas.quotes.request), c.request);
  router.get('/', read, validate(schemas.quotes.list, 'query'), c.list);
  router.get('/:quoteNumber', read, quoteNumber, c.get);
  router.post('/:quoteNumber/price', agent, quoteNumber, validate(schemas.quotes.price), c.price);
  router.post('/:quoteNumber/send', agent, quoteNumber, c.send);
  router.post('/:quoteNumber/approve', requirePermission('quote:approve'), quoteNumber, c.approve);
  router.post(
    '/:quoteNumber/reject',
    requirePermission('quote:accept', 'quote:price'),
    quoteNumber,
    validate(schemas.quotes.decision),
    c.reject,
  );
  router.post('/:quoteNumber/accept', requirePermission('quote:accept'), quoteNumber, validate(schemas.quotes.accept), c.accept);
  router.post(
    '/:quoteNumber/convert',
    requirePermission('quote:accept'),
    idempotency(idempotencyStore),
    quoteNumber,
    validate(schemas.quotes.accept),
    c.convert,
  );
  return router;
}

module.exports = { cartRoutes, checkoutRoutes, orderRoutes, quoteRoutes };
