import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { BillingService } from './billing.service';
import { INVOICE_STATUSES } from './billing.types';

const Period = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM');

const InvoiceListQuery = PaginationQuery.extend({
  status: z.enum(INVOICE_STATUSES).optional(),
  fromPeriod: Period.optional(),
  toPeriod: Period.optional()
});

const TrendQuery = z.object({ fromPeriod: Period, toPeriod: Period });

const DisputeBody = z.object({ reason: z.string().trim().min(10).max(2000) });

const CostCentreBody = z.object({
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{2,20}$/, 'code must be 2-20 letters, digits, - or _'),
  name: z.string().trim().min(2).max(100),
  monthlyBudgetMinor: z.number().int().nonnegative().nullable().default(null)
});

const CostCentrePatch = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    monthlyBudgetMinor: z.number().int().nonnegative().nullable().optional(),
    active: z.boolean().optional()
  })
  .refine((b) => Object.keys(b).length > 0, 'At least one field must be supplied');

const SplitBody = z.object({
  rules: z
    .array(z.object({ costCentreId: z.string().uuid(), shareBps: z.number().int().min(1).max(10_000) }))
    .max(20)
});

const SiteParam = z.object({ siteId: z.string().uuid() });

export function billingRoutes(service: BillingService): Router {
  const router = Router();

  router.get(
    '/invoices',
    requirePermission('billing:read'),
    validate({ query: InvoiceListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof InvoiceListQuery>;
      res.json(await service.listInvoices(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/invoices/:id',
    requirePermission('billing:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.getInvoice(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/invoices/:id/dispute',
    requirePermission('billing:manage'),
    validate({ params: UuidParam, body: DisputeBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.disputeInvoice(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.get(
    '/invoices/:id/allocation',
    requirePermission('billing:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      const ctx = requireAuth(req);
      if (req.accepts(['application/json', 'text/csv']) === 'text/csv') {
        const csv = await service.allocationCsv(ctx, req.params.id);
        res.type('text/csv').attachment(csv.filename).send(csv.body);
        return;
      }
      res.json(await service.allocationReport(ctx, req.params.id));
    })
  );

  router.get(
    '/billing/spend-trend',
    requirePermission('billing:read'),
    validate({ query: TrendQuery }),
    asyncHandler(async (req, res) => {
      const { fromPeriod, toPeriod } = res.locals.query as z.infer<typeof TrendQuery>;
      res.json({ items: await service.spendTrend(requireAuth(req), fromPeriod, toPeriod) });
    })
  );

  router.get(
    '/cost-centres',
    requirePermission('billing:read'),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.listCostCentres(requireAuth(req)) });
    })
  );

  router.post(
    '/cost-centres',
    requirePermission('billing:manage'),
    validate({ body: CostCentreBody }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.createCostCentre(requireAuth(req), req.body));
    })
  );

  router.patch(
    '/cost-centres/:id',
    requirePermission('billing:manage'),
    validate({ params: UuidParam, body: CostCentrePatch }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateCostCentre(requireAuth(req), req.params.id, req.body));
    })
  );

  router.get(
    '/sites/:siteId/cost-split',
    requirePermission('billing:read'),
    validate({ params: SiteParam }),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.getSplitRules(requireAuth(req), req.params.siteId) });
    })
  );

  router.put(
    '/sites/:siteId/cost-split',
    requirePermission('billing:manage'),
    validate({ params: SiteParam, body: SplitBody }),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.setSplitRules(requireAuth(req), req.params.siteId, req.body.rules) });
    })
  );

  return router;
}
