import { Router } from 'express';
import { z } from 'zod';
import { requirePermission } from '../auth/rbac';
import type { Container } from '../container';
import { asyncHandler } from '../http/middleware';
import { APPLICATIONS } from '../providers/applicationCatalog';
import { businessPolicySchema, firewallRuleSchema } from '../validation/schemas';
import { parse } from '../validation/validate';
import { idParam } from './params';

const policyPreviewBody = z
  .object({ edgeIds: z.array(idParam).min(1).max(100), policies: z.array(businessPolicySchema).max(500) })
  .strict();

const firewallPreviewBody = z.object({ rules: z.array(firewallRuleSchema).max(1000) }).strict();

export function configRoutes(c: Container): Router {
  const r = Router({ mergeParams: true });

  r.get('/applications', requirePermission('policy:read'), (_req, res) => {
    res.json(APPLICATIONS.map(({ key, label, category }) => ({ key, label, category })));
  });

  r.get('/edges/:edgeId/policies', requirePermission('policy:read'), asyncHandler(async (req, res) => {
    res.json(await c.edgeConfig.policies(req.params.accountId, parse(idParam, req.params.edgeId)));
  }));

  r.get('/edges/:edgeId/firewall-rules', requirePermission('firewall:read'), asyncHandler(async (req, res) => {
    res.json(await c.edgeConfig.firewall(req.params.accountId, parse(idParam, req.params.edgeId)));
  }));

  r.post('/policies/preview', requirePermission('policy:read'), asyncHandler(async (req, res) => {
    const body = parse(policyPreviewBody, req.body);
    res.json(await c.edgeConfig.previewPolicies(req.params.accountId, body.edgeIds, body.policies));
  }));

  r.post('/firewall-rules/preview', requirePermission('firewall:read'), (req, res, next) => {
    try {
      res.json(c.edgeConfig.previewFirewall(parse(firewallPreviewBody, req.body).rules));
    } catch (err) {
      next(err);
    }
  });

  return r;
}
