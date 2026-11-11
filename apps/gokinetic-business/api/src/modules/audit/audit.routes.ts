import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AuditService } from './audit.service';

const Filter = z.object({
  entity: z
    .string()
    .regex(/^[a-z_]{2,40}$/, 'entity must be a lower-case entity name')
    .optional(),
  actorId: z.string().uuid().optional()
});

const ListQuery = PaginationQuery.merge(Filter);

export function auditRoutes(service: AuditService): Router {
  const router = Router();

  router.get(
    '/audit-log',
    requirePermission('audit:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/audit-log/export',
    requirePermission('audit:read'),
    validate({ query: Filter }),
    asyncHandler(async (req, res) => {
      const csv = await service.exportCsv(requireAuth(req), res.locals.query as z.infer<typeof Filter>);
      res.type('text/csv').attachment(csv.filename).send(csv.body);
    })
  );

  return router;
}
