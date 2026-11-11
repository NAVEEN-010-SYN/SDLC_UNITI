import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { PaginationQuery } from '../../lib/pagination';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { listProducts } from './catalogue';
import { MAX_BULK_ITEMS, OrdersService } from './orders.service';
import { ORDER_STATUSES, ORDER_TYPES } from './orders.types';

const OrderRequestSchema = z.object({
  orderType: z.enum(ORDER_TYPES),
  siteId: z.string().uuid(),
  targetSiteId: z.string().uuid().nullish(),
  serviceId: z.string().uuid().nullish(),
  productCode: z.string().trim().max(40).nullish(),
  requestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'requestedDate must be YYYY-MM-DD')
    .nullish(),
  notes: z.string().trim().max(1000).nullish()
});

const CreateBody = OrderRequestSchema.extend({ submit: z.boolean().default(false) });

const BulkBody = z.object({
  submit: z.boolean().default(false),
  items: z.array(OrderRequestSchema).min(1).max(MAX_BULK_ITEMS)
});

const ListQuery = PaginationQuery.extend({
  status: z.enum(ORDER_STATUSES).optional(),
  orderType: z.enum(ORDER_TYPES).optional(),
  siteId: z.string().uuid().optional(),
  batchId: z.string().uuid().optional()
});

const ReasonBody = z.object({ reason: z.string().trim().min(3).max(500) });

const FulfilBody = z.object({
  status: z.enum(['PROVISIONING', 'ACTIVE', 'FAILED']),
  reason: z.string().trim().max(500).optional()
});

export function ordersRoutes(service: OrdersService): Router {
  const router = Router();

  router.get('/catalogue/products', requirePermission('orders:read'), (_req, res) => {
    res.json({ items: listProducts() });
  });

  router.get(
    '/orders',
    requirePermission('orders:read'),
    validate({ query: ListQuery }),
    asyncHandler(async (req, res) => {
      const { page, pageSize, ...filter } = res.locals.query as z.infer<typeof ListQuery>;
      res.json(await service.list(requireAuth(req), filter, { page, pageSize }));
    })
  );

  router.post(
    '/orders/quote',
    requirePermission('orders:create'),
    validate({ body: OrderRequestSchema }),
    asyncHandler(async (req, res) => {
      res.json(await service.quote(requireAuth(req), req.body));
    })
  );

  router.post(
    '/orders',
    requirePermission('orders:create'),
    validate({ body: CreateBody }),
    asyncHandler(async (req, res) => {
      const { submit, ...request } = req.body as z.infer<typeof CreateBody>;
      const order = await service.create(requireAuth(req), request, submit);
      res.status(201).location(`/api/v1/orders/${order.id}`).json(order);
    })
  );

  router.post(
    '/orders/bulk',
    requirePermission('orders:create'),
    validate({ body: BulkBody }),
    asyncHandler(async (req, res) => {
      const { submit, items } = req.body as z.infer<typeof BulkBody>;
      res.status(201).json(await service.createBulk(requireAuth(req), items, submit));
    })
  );

  router.get(
    '/orders/:id',
    requirePermission('orders:read'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.get(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/submit',
    requirePermission('orders:create'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.submit(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/approve',
    requirePermission('orders:approve'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json(await service.approve(requireAuth(req), req.params.id));
    })
  );

  router.post(
    '/orders/:id/reject',
    requirePermission('orders:approve'),
    validate({ params: UuidParam, body: ReasonBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.reject(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.post(
    '/orders/:id/cancel',
    requirePermission('orders:create'),
    validate({ params: UuidParam, body: ReasonBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.cancel(requireAuth(req), req.params.id, req.body.reason));
    })
  );

  router.post(
    '/orders/:id/fulfilment',
    requirePermission('orders:fulfil'),
    validate({ params: UuidParam, body: FulfilBody }),
    asyncHandler(async (req, res) => {
      res.json(await service.fulfil(requireAuth(req), req.params.id, req.body.status, req.body.reason));
    })
  );

  return router;
}
