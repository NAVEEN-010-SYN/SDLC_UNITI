import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { paginate } from '../repositories/InMemoryRepository';
import { paginationQuery, timeRangeQuery } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const edgeListQuery = paginationQuery.extend({
  siteId: z.string().max(200).optional(),
  status: z.enum(['UP', 'DEGRADED', 'DOWN', 'UNKNOWN']).optional(),
  vendor: z.enum(['VELOCLOUD', 'FORTINET']).optional(),
  q: z.string().trim().max(100).optional(),
});

const eventsQuery = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  edgeId: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

export function inventoryRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });
  const canRead = requirePermission('inventory:read');

  r.get('/summary', canRead, asyncHandler(async (req, res) => {
    res.json(await c.inventory.summary(req.params.accountId));
  }));

  r.post('/inventory/refresh', canRead, asyncHandler(async (req, res) => {
    const inv = await c.inventory.inventory(req.params.accountId, { refresh: true });
    res.json({ fetchedAt: inv.fetchedAt, sites: inv.sites.length, edges: inv.edges.length, unavailable: inv.unavailable });
  }));

  r.get('/sites', canRead, asyncHandler(async (req, res) => {
    const page = parse(paginationQuery, req.query);
    res.json(paginate(await c.inventory.listSites(req.params.accountId), page));
  }));

  r.get('/sites/:siteId', canRead, asyncHandler(async (req, res) => {
    res.json(await c.inventory.getSite(req.params.accountId, parse(idParam, req.params.siteId)));
  }));

  r.get('/edges', canRead, asyncHandler(async (req, res) => {
    const q = parse(edgeListQuery, req.query);
    const needle = q.q?.toLowerCase();
    const edges = (await c.inventory.listEdges(req.params.accountId, { siteId: q.siteId, status: q.status })).filter(
      (e) =>
        (!q.vendor || e.vendor === q.vendor) &&
        (!needle || e.name.toLowerCase().includes(needle) || e.serialNumber.toLowerCase().includes(needle)),
    );
    res.json(paginate(edges, q));
  }));

  r.get('/edges/:edgeId', canRead, asyncHandler(async (req, res) => {
    const { edge } = await c.inventory.resolveEdge(req.params.accountId, parse(idParam, req.params.edgeId));
    res.json(edge);
  }));

  r.get('/edges/:edgeId/health', requirePermission('health:read'), asyncHandler(async (req, res) => {
    const range = parse(timeRangeQuery, req.query);
    res.json(await c.health.edgeHealth(req.params.accountId, parse(idParam, req.params.edgeId), range));
  }));

  r.get('/health/overview', requirePermission('health:read'), asyncHandler(async (req, res) => {
    res.json(await c.health.overview(req.params.accountId, parse(timeRangeQuery, req.query)));
  }));

  r.get('/events', requirePermission('alert:read'), asyncHandler(async (req, res) => {
    const q = parse(eventsQuery, req.query);
    const range = parse(timeRangeQuery, { from: q.from, to: q.to });
    res.json(await c.alerts.events(req.params.accountId, range, { edgeId: q.edgeId, limit: q.limit }));
  }));

  return r;
}
