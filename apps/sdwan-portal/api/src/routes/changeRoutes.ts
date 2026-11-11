import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { changeQuerySchema, createChangeRequestSchema, decisionSchema, scheduleSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const cancelBody = z.object({ reason: z.string().trim().max(500).optional() }).strict();

export function changeRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/', requirePermission('change:read'), asyncHandler(async (req, res) => {
    res.json(await c.changes.list(req.params.accountId, parse(changeQuerySchema, req.query)));
  }));

  r.post('/', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const cr = await c.changes.create(principalOf(res.locals), req.params.accountId, parse(createChangeRequestSchema, req.body));
    res.status(201).location(`${req.baseUrl}/${cr.id}`).json(cr);
  }));

  r.get('/:id', requirePermission('change:read'), asyncHandler(async (req, res) => {
    res.json(await c.changes.get(req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.post('/:id/submit', requirePermission('change:create'), asyncHandler(async (req, res) => {
    res.json(await c.changes.submit(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.post('/:id/decisions', requirePermission('change:approve'), asyncHandler(async (req, res) => {
    const decision = parse(decisionSchema, req.body);
    res.json(await c.changes.decide(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), decision));
  }));

  r.post('/:id/schedule', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const body = parse(scheduleSchema, req.body);
    res.json(await c.changes.schedule(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), body));
  }));

  r.post('/:id/cancel', requirePermission('change:create'), asyncHandler(async (req, res) => {
    const { reason } = parse(cancelBody, req.body ?? {});
    res.json(await c.changes.cancel(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id), reason));
  }));

  return r;
}
