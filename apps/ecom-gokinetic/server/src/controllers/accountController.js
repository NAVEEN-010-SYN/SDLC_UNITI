'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Account self-service, invoices and promo administration endpoints. */
function createAccountController({ accountService, invoiceService, promoService }) {
  return {
    overview: asyncHandler(async (req, res) => {
      res.json(await accountService.getOverview(req.user));
    }),

    updateProfile: asyncHandler(async (req, res) => {
      res.json(await accountService.updateProfile(req.user, req.body));
    }),

    addAddress: asyncHandler(async (req, res) => {
      res.status(201).json({ items: await accountService.addAddress(req.user, req.body) });
    }),

    removeAddress: asyncHandler(async (req, res) => {
      res.json({ items: await accountService.removeAddress(req.user, req.params.addressId) });
    }),

    listMembers: asyncHandler(async (req, res) => {
      res.json({ items: await accountService.listMembers(req.user) });
    }),

    inviteMember: asyncHandler(async (req, res) => {
      res.status(201).json(await accountService.inviteMember(req.user, req.body));
    }),

    disableMember: asyncHandler(async (req, res) => {
      res.json(await accountService.disableMember(req.user, req.params.userId));
    }),

    listInvoices: asyncHandler(async (req, res) => {
      res.json(await invoiceService.list(req.user, req.validatedQuery));
    }),

    getInvoice: asyncHandler(async (req, res) => {
      res.json(await invoiceService.get(req.user, req.params.invoiceNumber));
    }),

    listPromos: asyncHandler(async (req, res) => {
      res.json(await promoService.list(req.validatedQuery));
    }),

    getPromo: asyncHandler(async (req, res) => {
      res.json(await promoService.get(req.params.code));
    }),

    upsertPromo: asyncHandler(async (req, res) => {
      res.json(await promoService.upsert(req.body));
    }),

    deactivatePromo: asyncHandler(async (req, res) => {
      res.json(await promoService.deactivate(req.params.code));
    }),
  };
}

module.exports = { createAccountController };
