import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { SlaService } from './sla.service';

const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM') });

export function slaRoutes(service: SlaService): Router {
  const router = Router();

  router.get(
    '/sla/policy',
    requirePermission('sla:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.policy(requireAuth(req)));
    })
  );

  router.get(
    '/sla/reports/:period',
    requirePermission('sla:read'),
    validate({ params: PeriodParam }),
    asyncHandler(async (req, res) => {
      const report = await service.monthlyReport(requireAuth(req), req.params.period);
      // Closed periods are immutable; allow private caching of those only.
      res.setHeader('Cache-Control', report.provisional ? 'no-store' : 'private, max-age=3600');
      res.json(report);
    })
  );

  return router;
}
