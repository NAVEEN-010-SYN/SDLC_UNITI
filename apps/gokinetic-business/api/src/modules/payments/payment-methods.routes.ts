import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { UuidParam, validate } from '../../middleware/validate';
import { PaymentMethodsService } from './payment-methods.service';
import { CARD_BRANDS } from './payment-methods.types';

const HolderName = z.string().trim().min(2).max(70);

const CardBody = z.object({
  kind: z.literal('CARD'),
  providerToken: z.string().regex(/^tok_[A-Za-z0-9]{16,64}$/, 'providerToken must be a provider card token'),
  holderName: HolderName,
  cardBrand: z.enum(CARD_BRANDS),
  last4: z.string().regex(/^\d{4}$/),
  expiryMonth: z.number().int().min(1).max(12),
  expiryYear: z.number().int().min(2000).max(2100),
  makeDefault: z.boolean().default(false)
});

const DirectDebitBody = z.object({
  kind: z.literal('DIRECT_DEBIT'),
  holderName: HolderName,
  sortCode: z.string().trim().max(10),
  accountNumber: z.string().trim().max(12),
  makeDefault: z.boolean().default(false)
});

const AddBody = z.discriminatedUnion('kind', [CardBody, DirectDebitBody]);

export function paymentMethodsRoutes(service: PaymentMethodsService): Router {
  const router = Router();

  router.get(
    '/payment-methods',
    requirePermission('billing:read'),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.list(requireAuth(req)) });
    })
  );

  router.post(
    '/payment-methods',
    requirePermission('billing:manage'),
    validate({ body: AddBody }),
    asyncHandler(async (req, res) => {
      const method = await service.add(requireAuth(req), req.body);
      res.status(201).location(`/api/v1/payment-methods/${method.id}`).json(method);
    })
  );

  router.post(
    '/payment-methods/:id/default',
    requirePermission('billing:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      res.json({ items: await service.setDefault(requireAuth(req), req.params.id) });
    })
  );

  router.delete(
    '/payment-methods/:id',
    requirePermission('billing:manage'),
    validate({ params: UuidParam }),
    asyncHandler(async (req, res) => {
      await service.remove(requireAuth(req), req.params.id);
      res.status(204).end();
    })
  );

  return router;
}
