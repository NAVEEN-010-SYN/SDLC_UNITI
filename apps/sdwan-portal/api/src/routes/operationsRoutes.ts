import { Router } from 'express';
import { z } from 'zod';
import { principalOf, requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { toCsv } from '../services/ReportService';
import { alertQuerySchema, createBackupSchema, maintenanceWindowSchema, paginationQuery, reportQuerySchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const backupListQuery = paginationQuery.extend({ edgeId: idParam.optional() });
const diffQuery = z.object({ against: idParam.optional() });
const upcomingQuery = z.object({ days: z.coerce.number().int().min(1).max(60).default(14) });

/** Backups, maintenance windows, alerts and reports: the day-two operations surface. */
export function operationsRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/backups', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    const q = parse(backupListQuery, req.query);
    res.json(await c.backups.list(req.params.accountId, q, q.edgeId));
  }));

  r.post('/backups', requirePermission('backup:create'), asyncHandler(async (req, res) => {
    const { edgeId } = parse(createBackupSchema, req.body);
    const backup = await c.backups.create(req.params.accountId, edgeId, principalOf(res.locals).userId);
    res.status(201).location(`${req.baseUrl}/backups/${backup.id}`).json(backup);
  }));

  r.get('/backups/:id', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    res.json(await c.backups.get(req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.get('/backups/:id/diff', requirePermission('backup:read'), asyncHandler(async (req, res) => {
    const { against } = parse(diffQuery, req.query);
    res.json(await c.backups.diff(req.params.accountId, parse(idParam, req.params.id), against));
  }));

  r.get('/maintenance-windows', requirePermission('maintenance:read'), asyncHandler(async (req, res) => {
    res.json(await c.windows.list(req.params.accountId));
  }));

  r.get('/maintenance-windows/upcoming', requirePermission('maintenance:read'), asyncHandler(async (req, res) => {
    res.json(await c.windows.upcoming(req.params.accountId, parse(upcomingQuery, req.query).days));
  }));

  r.post('/maintenance-windows', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    const w = await c.windows.create(req.params.accountId, parse(maintenanceWindowSchema, req.body));
    res.status(201).location(`${req.baseUrl}/maintenance-windows/${w.id}`).json(w);
  }));

  r.put('/maintenance-windows/:id', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    res.json(await c.windows.update(req.params.accountId, parse(idParam, req.params.id), parse(maintenanceWindowSchema, req.body)));
  }));

  r.delete('/maintenance-windows/:id', requirePermission('maintenance:write'), asyncHandler(async (req, res) => {
    await c.windows.remove(req.params.accountId, parse(idParam, req.params.id));
    res.status(204).end();
  }));

  r.get('/alerts', requirePermission('alert:read'), asyncHandler(async (req, res) => {
    res.json(await c.alerts.list(req.params.accountId, parse(alertQuerySchema, req.query)));
  }));

  r.post('/alerts/:id/acknowledge', requirePermission('alert:manage'), asyncHandler(async (req, res) => {
    res.json(await c.alerts.acknowledge(principalOf(res.locals), req.params.accountId, parse(idParam, req.params.id)));
  }));

  r.get('/reports/sla', requirePermission('report:read'), asyncHandler(async (req, res) => {
    const q = parse(reportQuerySchema, req.query);
    const report = await c.reports.slaReport(req.params.accountId, q.period);
    if (q.format === 'csv') {
      res
        .type('text/csv')
        .attachment(`sla-${req.params.accountId}-${q.period}.csv`)
        .send(toCsv(report.links));
      return;
    }
    res.json(report);
  }));

  return r;
}
