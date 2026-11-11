import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { TicketsService } from './tickets.service';
import { TICKET_CATEGORIES, TICKET_PRIORITIES, TICKET_STATUSES } from './tickets.types';

const ListQuery = PaginationQuery.extend({
  status: z.enum(TICKET_STATUSES).optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
  category: z.enum(TICKET_CATEGORIES).optional(),
  siteId: z.string().uuid().optional(),
  search: z.string().trim().min(2).max(80).optional(),
  activeOnly: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional()
});

const CreateBody = z.object({
  category: z.enum(TICKET_CATEGORIES),
  priority: z.enum(TICKET_PRIORITIES),
  serviceId: z.string().uuid().nullish(),
  siteId: z.string().uuid().nullish(),
  subject: z.string().trim().min(5).max(140),
  description: z.string().trim().min(20).max(5000),
  contactPhone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{7,20}$/, 'contactPhone must be a valid phone number')
    .nullish()
});

const Version = z.number().int().positive();

const CommentBody = z.object({
  body: z.string().trim().min(1).max(5000),
  internal: z.boolean().default(false),
  version: Version
});

const StatusBody = z.object({
  status: z.enum(TICKET_STATUSES),
  reason: z.string().trim().max(1000).optional(),
  version: Version
});

const EscalateBody = z.object({ reason: z.string().trim().min(10).max(1000), version: Version });

const PriorityBody = z.object({
  priority: z.enum(TICKET_PRIORITIES),
  reason: z.string().trim().min(3).max(1000),
  version: Version
});

export function ticketsRoutes(service: TicketsService): Router {
  const router = Router();

  router.get(
    '/tickets',
    requirePermission('tickets:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/tickets',
    requirePermission('tickets:create'),
    validate({ body: CreateBody }),
    asyncHandler(async (req, res) => {
      const ticket = await service.create(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/tickets/${ticket.id}`).json(ticket);
    })
  );

  router.get(
    '/tickets/:id',
    requirePermission('tickets:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/tickets/:id/comments',
    requirePermission('tickets:create'),
    validate({ params: UuidParam, body: CommentBody }),
    asyncHandler(async (req, res) => {
      res.status(201).json(await service.comment(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/tickets/:id/status',
    requirePermission('tickets:read'),
    validate({ params: UuidParam, body: StatusBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changeStatus(requireAuth(req), req.params.id, req.body));
    })
  );

  router.post(
    '/tickets/:id/escalate',
    requirePermission('tickets:escalate'),
    validate({ params: UuidParam, body: EscalateBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.escalate(requireAuth(req), req.params.id, req.body));
    })
  );

  router.put(
    '/tickets/:id/priority',
    requirePermission('tickets:internal'),
    validate({ params: UuidParam, body: PriorityBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changePriority(requireAuth(req), req.params.id, req.body));
    })
  );

  return router;
}
