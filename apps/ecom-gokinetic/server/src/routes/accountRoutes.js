'use strict';

const express = require('express');
const schemas = require('../validation/schemas');
const { validateRequest: validate } = require('../middleware/validate');
const { requirePermission } = require('../middleware/rbac');
const { paramMatchesBody } = require('../middleware/paramMatchesBody');

/** Account self-service, invoices and back-office promo management. */
function accountRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  const manageUsers = requirePermission('account:manage-users');

  router.use(guards.authenticated, requirePermission('account:read'));
  router.get('/', c.overview);
  router.patch('/profile', validate(schemas.account.updateProfile), c.updateProfile);
  router.post('/addresses', validate(schemas.account.addAddress), c.addAddress);
  router.delete('/addresses/:addressId', validate(schemas.account.addressIdParam, 'params'), c.removeAddress);
  router.get('/users', c.listMembers);
  router.post('/users', manageUsers, validate(schemas.account.inviteUser), c.inviteMember);
  router.post('/users/:userId/disable', manageUsers, validate(schemas.account.userIdParam, 'params'), c.disableMember);
  return router;
}

function invoiceRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  router.use(guards.authenticated, requirePermission('account:read', 'order:read:any'));
  router.get('/', validate(schemas.invoices.list, 'query'), c.listInvoices);
  router.get('/:invoiceNumber', validate(schemas.invoices.invoiceNumberParam, 'params'), c.getInvoice);
  return router;
}

function promoRoutes({ controllers, guards }) {
  const router = express.Router();
  const { account: c } = controllers;
  const code = validate(schemas.promos.codeParam, 'params');
  router.use(guards.authenticated, requirePermission('promo:manage'));
  router.get('/', validate(schemas.promos.list, 'query'), c.listPromos);
  router.get('/:code', code, c.getPromo);
  router.put('/:code', code, validate(schemas.promos.upsert), paramMatchesBody('code'), c.upsertPromo);
  router.delete('/:code', code, c.deactivatePromo);
  return router;
}

module.exports = { accountRoutes, invoiceRoutes, promoRoutes };
