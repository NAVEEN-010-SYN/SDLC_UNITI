'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

/** Business GoKinetic multi-site quotes and bulk order conversion. */
function createQuoteController({ quoteService }) {
  const number = (req) => req.params.quoteNumber;

  return {
    request: asyncHandler(async (req, res) => {
      const quote = await quoteService.request(req.user, req.body);
      res.status(201).location(`/api/v1/quotes/${quote.quoteNumber}`).json(quote);
    }),

    list: asyncHandler(async (req, res) => {
      res.json(await quoteService.list(req.user, req.validatedQuery));
    }),

    get: asyncHandler(async (req, res) => {
      res.json(await quoteService.get(req.user, number(req)));
    }),

    price: asyncHandler(async (req, res) => {
      res.json(await quoteService.price(req.user, number(req), req.body));
    }),

    send: asyncHandler(async (req, res) => {
      res.json(await quoteService.send(req.user, number(req)));
    }),

    approve: asyncHandler(async (req, res) => {
      res.json(await quoteService.approve(req.user, number(req)));
    }),

    reject: asyncHandler(async (req, res) => {
      res.json(await quoteService.reject(req.user, number(req), req.body));
    }),

    accept: asyncHandler(async (req, res) => {
      res.json(await quoteService.accept(req.user, number(req), req.body));
    }),

    convert: asyncHandler(async (req, res) => {
      const result = await quoteService.convert(req.user, number(req), req.body);
      res.status(201).json(result);
    }),
  };
}

module.exports = { createQuoteController };
