import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { UsersService } from './users.service';
import { BUSINESS_ROLES, USER_STATUSES } from './users.types';

const ListQuery = PaginationQuery.extend({
  role: z.enum(BUSINESS_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  search: z.string().trim().min(2).max(80).optional()
});

const SiteScope = z.array(z.string().uuid()).max(500).nullish();

const InviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  role: z.enum(BUSINESS_ROLES),
  siteScope: SiteScope
});

const RoleBody = z.object({
  role: z.enum(BUSINESS_ROLES),
  siteScope: SiteScope,
  version: z.number().int().positive()
});

const VersionBody = z.object({ version: z.number().int().positive() });

export function usersRoutes(service: UsersService): Router {
  const router = Router();

  router.get(
    '/users',
    requirePermission('users:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.get(
    '/users/:id',
    requirePermission('users:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/users',
    requirePermission('users:manage'),
    validate({ body: InviteBody }),
    asyncHandler(async (req, res) => {
      const user = await service.invite(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/users/${user.id}`).json(user);
    })
  );

  router.put(
    '/users/:id/role',
    requirePermission('users:manage'),
    validate({ params: UuidParam, body: RoleBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.changeRole(requireAuth(req), req.params.id, req.body));
    })
  );

  for (const action of ['suspend', 'reactivate', 'deactivate'] as const) {
    router.post(
      `/users/:id/${action}`,
      requirePermission('users:manage'),
      validate({ params: UuidParam, body: VersionBody }),
      asyncHandler(async (req, res) => {
        res.json(await service.transition(requireAuth(req), req.params.id, action, req.body.version));
      })
    );
  }

  router.post(
    '/users/:id/resend-invitation',
    requirePermission('users:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      await service.resendInvitation(requireAuth(req), req.params.id);
      res.status(202).end();
    })
  );

  return router;
}
