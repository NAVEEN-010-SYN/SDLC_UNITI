'use strict';

const express = require('express');
const { authenticate, optionalAuthenticate } = require('../middleware/auth');
const { createAuthController } = require('../controllers/authController');
const { createCatalogController } = require('../controllers/catalogController');
const { createCartController } = require('../controllers/cartController');
const { createOrderController } = require('../controllers/orderController');
const { createQuoteController } = require('../controllers/quoteController');
const { createAccountController } = require('../controllers/accountController');
const { authRoutes, catalogRoutes, serviceabilityRoutes } = require('./publicRoutes');
const { cartRoutes, checkoutRoutes, orderRoutes, quoteRoutes } = require('./commerceRoutes');
const { accountRoutes, invoiceRoutes, promoRoutes } = require('./accountRoutes');

/**
 * Builds the `/api/v1` router from a container.
 * @param {{ container: object, healthRouter?: express.Router }} deps
 */
function createApiRouter({ container, healthRouter }) {
  const { config, services, repos } = container;
  const guards = {
    authenticated: authenticate(config.auth),
    optional: optionalAuthenticate(config.auth),
  };
  const controllers = {
    auth: createAuthController(services),
    catalog: createCatalogController(services),
    cart: createCartController(services),
    order: createOrderController(services),
    quote: createQuoteController(services),
    account: createAccountController(services),
  };
  const deps = { controllers, guards, config, idempotencyStore: repos.idempotency };

  const api = express.Router();
  if (healthRouter) api.use('/health', healthRouter);
  api.use('/auth', authRoutes(deps));
  api.use('/products', catalogRoutes(deps));
  api.use('/serviceability', serviceabilityRoutes(deps));
  api.use('/carts', cartRoutes(deps));
  api.use('/checkout', checkoutRoutes(deps));
  api.use('/orders', orderRoutes(deps));
  api.use('/quotes', quoteRoutes(deps));
  api.use('/account', accountRoutes(deps));
  api.use('/invoices', invoiceRoutes(deps));
  api.use('/promos', promoRoutes(deps));
  return api;
}

module.exports = { createApiRouter };
