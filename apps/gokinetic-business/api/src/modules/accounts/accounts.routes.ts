import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { AccountsService, MAX_APPROVAL_THRESHOLD_MINOR } from './accounts.service';

const ThresholdBody = z.object({
  approvalThresholdMinor: z.number().int().min(0).max(MAX_APPROVAL_THRESHOLD_MINOR)
});

export function accountsRoutes(service: AccountsService): Router {
  const router = Router();

  router.get(
    '/me',
    asyncHandler(async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await service.me(requireAuth(req)));
    })
  );

  router.get(
    '/account',
    requirePermission('sites:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req)));
    })
  );

  router.put(
    '/account/approval-threshold',
    requirePermission('orders:approve'),
    validate({ body: ThresholdBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.updateApprovalThreshold(requireAuth(req), req.body.approvalThresholdMinor));
    })
  );

  return router;
}
