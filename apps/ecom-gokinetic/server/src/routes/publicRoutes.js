'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { paramMatchesBody } = require('../middleware/paramMatchesBody');
const { rateLimit } = require('../middleware/rateLimit');

/**
 * Auth, catalogue and serviceability routes: the parts of the API an
 * anonymous shopper can reach (plus catalogue administration).
 */
function authRoutes({ controllers, guards, config }) {
  const router = express.Router();
  const { auth: c } = controllers;
  const authLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.authMax,
    name: 'auth',
    keyGenerator: (req) => `ip:${req.ip}`,
  });

  router.post('/register', authLimiter, validate(schemas.auth.register), c.register);
  router.post('/login', authLimiter, validate(schemas.auth.login), c.login);
  router.post('/refresh', authLimiter, validate(schemas.auth.refresh), c.refresh);
  router.post('/logout', validate(schemas.auth.refresh), c.logout);
  router.post('/activate', authLimiter, validate(schemas.account.activateInvite), c.activateInvite);
  router.get('/me', guards.authenticated, c.me);
  router.post('/change-password', guards.authenticated, validate(schemas.auth.changePassword), c.changePassword);
  return router;
}

function catalogRoutes({ controllers, guards }) {
  const router = express.Router();
  const { catalog: c } = controllers;
  const manage = [guards.authenticated, requirePermission('catalog:manage')];

  router.get('/', validate(schemas.catalog.list, 'query'), c.list);
  // Registered before '/:sku' so "compare" is not captured as a SKU.
  router.get('/compare', validate(schemas.catalog.compare, 'query'), c.compare);
  router.get(
    '/:sku',
    validate(schemas.catalog.skuParam, 'params'),
    validate(schemas.catalog.detail, 'query'),
    c.detail,
  );
  router.put(
    '/:sku',
    ...manage,
    validate(schemas.catalog.skuParam, 'params'),
    validate(schemas.catalog.upsert),
    paramMatchesBody('sku'),
    c.upsert,
  );
  router.delete('/:sku', ...manage, validate(schemas.catalog.skuParam, 'params'), c.deactivate);
  return router;
}

function serviceabilityRoutes({ controllers, guards }) {
  const router = express.Router();
  const { catalog: c } = controllers;
  const checkId = validate(schemas.serviceability.checkIdParam, 'params');

  router.post('/checks', guards.optional, validate(schemas.serviceability.check), c.checkAddress);
  router.get('/checks/:checkId', guards.optional, checkId, c.getCheck);
  router.get(
    '/checks/:checkId/install-slots',
    guards.optional,
    checkId,
    validate(schemas.serviceability.slots, 'query'),
    c.installSlots,
  );
  return router;
}

module.exports = { authRoutes, catalogRoutes, serviceabilityRoutes };
