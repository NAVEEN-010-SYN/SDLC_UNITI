'use strict';

const { asyncHandler } = require('../middleware/asyncHandler');

const CATALOG_CACHE_SECONDS = 60;

function createCatalogController({ catalogService, serviceability, installScheduling }) {
  return {
    list: asyncHandler(async (req, res) => {
      const { serviceabilityCheckId, ...query } = req.validatedQuery;
      const page = await catalogService.list(query, { serviceabilityCheckId });
      // Address-filtered listings are personal; generic ones can be cached by the CDN.
      res.set('Cache-Control', serviceabilityCheckId ? 'private, no-store' : `public, max-age=${CATALOG_CACHE_SECONDS}`);
      res.json(page);
    }),

    compare: asyncHandler(async (req, res) => {
      const skus = [...new Set(req.validatedQuery.skus.split(',').map((s) => s.trim()))];
      res.json({ items: await catalogService.compare(skus) });
    }),

    detail: asyncHandler(async (req, res) => {
      res.set('Cache-Control', `public, max-age=${CATALOG_CACHE_SECONDS}`);
      res.json(await catalogService.getWithBundleOptions(req.params.sku, req.validatedQuery.segment));
    }),

    upsert: asyncHandler(async (req, res) => {
      res.json(await catalogService.upsert(req.body));
    }),

    deactivate: asyncHandler(async (req, res) => {
      res.json(await catalogService.deactivate(req.params.sku));
    }),

    checkAddress: asyncHandler(async (req, res) => {
      const result = await serviceability.check(req.body.address, { segment: req.body.segment });
      res.status(201).location(`/api/v1/serviceability/checks/${result.checkId}`).json(result);
    }),

    getCheck: asyncHandler(async (req, res) => {
      res.json(await serviceability.getCheck(req.params.checkId, { segment: req.user ? req.user.segment : undefined }));
    }),

    installSlots: asyncHandler(async (req, res) => {
      res.json(
        await installScheduling.listSlots(req.params.checkId, {
          days: req.validatedQuery.days,
          segment: req.user ? req.user.segment : undefined,
        }),
      );
    }),
  };
}

module.exports = { createCatalogController };
