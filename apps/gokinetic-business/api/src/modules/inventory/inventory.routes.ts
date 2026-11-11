import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { InventoryService } from './inventory.service';
import { SERVICE_CATEGORIES, SERVICE_STATUSES, SITE_STATUSES } from './inventory.types';

const SiteListQuery = PaginationQuery.extend({
  status: z.enum(SITE_STATUSES).optional(),
  search: z.string().trim().min(2).max(80).optional(),
  costCentreId: z.string().uuid().optional()
});

const CreateSiteBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]{2,20}$/, 'code must be 2-20 letters, digits or hyphens'),
  name: z.string().trim().min(2).max(120),
  addressLine1: z.string().trim().min(3).max(120),
  addressLine2: z.string().trim().max(120).nullish(),
  city: z.string().trim().min(2).max(80),
  postcode: z.string().trim().min(3).max(10),
  country: z.string().length(2).toUpperCase().default('GB'),
  costCentreId: z.string().uuid().nullish()
});

const UpdateSiteBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    costCentreId: z.string().uuid().nullable().optional()
  })
  .refine((b) => Object.keys(b).length > 0, 'At least one field must be supplied');

const ServiceListQuery = PaginationQuery.extend({
  siteId: z.string().uuid().optional(),
  category: z.enum(SERVICE_CATEGORIES).optional(),
  status: z.enum(SERVICE_STATUSES).optional(),
  contractId: z.string().uuid().optional()
});

export function inventoryRoutes(service: InventoryService): Router {
  const router = Router();

  router.get(
    '/inventory/summary',
    requirePermission('services:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.summary(requireAuth(req)));
    })
  );

  router.get(
    '/sites',
    requirePermission('sites:read'),
    validate({ query: SiteListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof SiteListQuery>;
      res.json(await service.listSites(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/sites',
    requirePermission('sites:manage'),
    validate({ body: CreateSiteBody }),
    asyncHandler(async (req, res) => {
      const site = await service.createSite(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/sites/${site.id}`).json(site);
    })
  );

  router.get(
    '/sites/:id',
    requirePermission('sites:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getSite(requireAuth(req), req.params.id));
    })
  );

  router.patch(
    '/sites/:id',
    requirePermission('sites:manage'),
    validate({ params: UuidParam, body: UpdateSiteBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateSite(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/sites/:id/decommission',
    requirePermission('sites:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.decommissionSite(requireAuth(req), req.params.id));
    })
  );

  router.get(
    '/services',
    requirePermission('services:read'),
    validate({ query: ServiceListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ServiceListQuery>;
      res.json(await service.listServices(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/services/:id',
    requirePermission('services:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getService(requireAuth(req), req.params.id));
    })
  );

  return router;
}
