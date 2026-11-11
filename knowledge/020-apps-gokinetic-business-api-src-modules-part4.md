# Go Kinetic Business self-care (B2B): apps/gokinetic-business/api/src/modules (part 4 of 8)

- **Application:** Go Kinetic Business self-care (B2B)
- **Tech stack:** Angular 17 + Node.js/Express API
- **Repository:** Uniti self-care platform monorepo (B2B, B2C and partner portals)
- **Files in this document:** 18

## Files

- `apps/gokinetic-business/api/src/modules/payments/payment-methods.repository.ts` (111 lines)
- `apps/gokinetic-business/api/src/modules/payments/payment-methods.routes.ts` (74 lines)
- `apps/gokinetic-business/api/src/modules/payments/payment-methods.service.test.ts` (151 lines)
- `apps/gokinetic-business/api/src/modules/payments/payment-methods.service.ts` (194 lines)
- `apps/gokinetic-business/api/src/modules/payments/payment-methods.types.ts` (52 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.availability.test.ts` (125 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.availability.ts` (116 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.clock.test.ts` (64 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.clock.ts` (97 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.policy.ts` (97 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.repository.ts` (73 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.routes.ts` (35 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.service.test.ts` (93 lines)
- `apps/gokinetic-business/api/src/modules/sla/sla.service.ts` (113 lines)
- `apps/gokinetic-business/api/src/modules/tickets/ticket-sla.test.ts` (98 lines)
- `apps/gokinetic-business/api/src/modules/tickets/ticket-sla.ts` (93 lines)
- `apps/gokinetic-business/api/src/modules/tickets/ticket-state-machine.ts` (53 lines)
- `apps/gokinetic-business/api/src/modules/tickets/tickets.repository.ts` (275 lines)

## apps/gokinetic-business/api/src/modules/payments/payment-methods.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-methods.repository.ts`.

```typescript
import { Db } from '../../db/query';
import { CardBrand, PaymentMethod, PaymentMethodKind } from './payment-methods.types';

interface PaymentMethodRow {
  id: string;
  account_id: string;
  kind: PaymentMethodKind;
  holder_name: string;
  card_brand: CardBrand | null;
  last4: string;
  expiry_month: number | null;
  expiry_year: number | null;
  sort_code_masked: string | null;
  is_default: boolean;
  created_at: Date;
}

export interface NewPaymentMethod {
  accountId: string;
  kind: PaymentMethodKind;
  providerRef: string;
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdBy: string;
}

const COLUMNS = 'id, account_id, kind, holder_name, card_brand, last4, expiry_month, expiry_year, sort_code_masked, is_default, created_at';

function toPaymentMethod(r: PaymentMethodRow): PaymentMethod {
  return {
    id: r.id,
    accountId: r.account_id,
    kind: r.kind,
    holderName: r.holder_name,
    cardBrand: r.card_brand,
    last4: r.last4,
    expiryMonth: r.expiry_month,
    expiryYear: r.expiry_year,
    sortCodeMasked: r.sort_code_masked,
    isDefault: r.is_default,
    createdAt: r.created_at.toISOString()
  };
}

export interface PaymentMethodsRepository {
  listActive(accountId: string, db?: Db): Promise<PaymentMethod[]>;
  /** Locks the account's active methods so default changes are serialised. */
  lockActive(accountId: string, db: Db): Promise<PaymentMethod[]>;
  insert(method: NewPaymentMethod, db: Db): Promise<PaymentMethod>;
  clearDefault(accountId: string, db: Db): Promise<void>;
  setDefault(accountId: string, id: string, db: Db): Promise<void>;
  /** Returns the provider reference so the caller can revoke it with the gateway. */
  markRemoved(accountId: string, id: string, at: Date, db: Db): Promise<string>;
}

export function createPaymentMethodsRepository(defaultDb: Db): PaymentMethodsRepository {
  return {
    async listActive(accountId, db = defaultDb) {
      const rows = await db.many<PaymentMethodRow>(
        `SELECT ${COLUMNS} FROM payment_methods WHERE account_id = $1 AND status = 'ACTIVE' ORDER BY is_default DESC, created_at`,
        [accountId]
      );
      return rows.map(toPaymentMethod);
    },

    async lockActive(accountId, db) {
      const rows = await db.many<PaymentMethodRow>(
        `SELECT ${COLUMNS} FROM payment_methods WHERE account_id = $1 AND status = 'ACTIVE' ORDER BY created_at FOR UPDATE`,
        [accountId]
      );
      return rows.map(toPaymentMethod);
    },

    async insert(m, db) {
      const row = await db.one<PaymentMethodRow>(
        `INSERT INTO payment_methods (account_id, kind, provider_ref, holder_name, card_brand, last4, expiry_month, expiry_year,
                                      sort_code_masked, is_default, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         RETURNING ${COLUMNS}`,
        [m.accountId, m.kind, m.providerRef, m.holderName, m.cardBrand, m.last4, m.expiryMonth, m.expiryYear, m.sortCodeMasked, m.isDefault, m.createdBy]
      );
      return toPaymentMethod(row);
    },

    async clearDefault(accountId, db) {
      await db.exec(`UPDATE payment_methods SET is_default = false WHERE account_id = $1 AND is_default AND status = 'ACTIVE'`, [accountId]);
    },

    async setDefault(accountId, id, db) {
      // Clear first: the partial unique index allows only one default per account.
      await this.clearDefault(accountId, db);
      await db.exec(`UPDATE payment_methods SET is_default = true WHERE account_id = $1 AND id = $2 AND status = 'ACTIVE'`, [accountId, id]);
    },

    async markRemoved(accountId, id, at, db) {
      const row = await db.one<{ provider_ref: string }>(
        `UPDATE payment_methods SET status = 'REMOVED', is_default = false, removed_at = $3
          WHERE account_id = $1 AND id = $2 AND status = 'ACTIVE'
          RETURNING provider_ref`,
        [accountId, id, at]
      );
      return row.provider_ref;
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/payments/payment-methods.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-methods.routes.ts`.

```typescript
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
```

## apps/gokinetic-business/api/src/modules/payments/payment-methods.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-methods.service.test.ts`.

```typescript
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, adminCtx, makeService, passthroughDb, recordingAudit } from '../../test/fixtures';
import { InventoryRepository } from '../inventory/inventory.repository';
import { PaymentMethodsRepository } from './payment-methods.repository';
import { PaymentMethodsService, maskSortCode, normaliseAccountNumber, normaliseSortCode, toView } from './payment-methods.service';
import { PaymentMethod } from './payment-methods.types';

const NOW = '2024-06-15T12:00:00.000Z';

function card(overrides: Partial<PaymentMethod> = {}): PaymentMethod {
  return {
    id: 'e1111111-1111-4111-8111-111111111111',
    accountId: ACCOUNT_ID,
    kind: 'CARD',
    holderName: 'Acme Ltd',
    cardBrand: 'VISA',
    last4: '4242',
    expiryMonth: 12,
    expiryYear: 2026,
    sortCodeMasked: null,
    isDefault: true,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...overrides
  };
}

const cardInput = {
  kind: 'CARD' as const,
  providerToken: 'tok_abcdefghijklmnop',
  holderName: 'Acme Ltd',
  cardBrand: 'MASTERCARD' as const,
  last4: '4444',
  expiryMonth: 3,
  expiryYear: 2027,
  makeDefault: false
};

function setup(methods: PaymentMethod[] = []) {
  const repo: jest.Mocked<PaymentMethodsRepository> = {
    listActive: jest.fn(async () => methods),
    lockActive: jest.fn(async () => methods),
    insert: jest.fn(async (m) => card({ ...m, id: 'e9999999-9999-4999-8999-999999999999' })),
    clearDefault: jest.fn(async () => undefined),
    setDefault: jest.fn(async () => undefined),
    markRemoved: jest.fn(async () => 'ref_123')
  };
  const gateway = {
    createMandate: jest.fn(async () => ({ mandateRef: 'MD-1' })),
    verifyCardToken: jest.fn(async () => ({ reusableRef: 'pm_1' })),
    revoke: jest.fn(async () => undefined)
  };
  const inventory = { allServices: jest.fn(async () => [makeService()]) } as unknown as jest.Mocked<InventoryRepository>;
  const audit = recordingAudit();
  const service = new PaymentMethodsService(passthroughDb(), repo, gateway, inventory, audit, fixedClock(NOW));
  return { repo, gateway, inventory, audit, service };
}

describe('bank detail normalisation', () => {
  it('accepts formatted sort codes and masks all but the last pair', () => {
    expect(normaliseSortCode('12-34 56')).toBe('123456');
    expect(maskSortCode('123456')).toBe('**-**-56');
  });

  it('rejects malformed bank details', () => {
    expect(() => normaliseSortCode('12345')).toThrow(BusinessRuleError);
    expect(() => normaliseAccountNumber('1234567a')).toThrow(BusinessRuleError);
  });
});

describe('toView', () => {
  const now = new Date(NOW);

  it('treats a card as valid through the end of its expiry month', () => {
    expect(toView(card({ expiryMonth: 6, expiryYear: 2024 }), now)).toMatchObject({ expired: false, expiresSoon: true });
    expect(toView(card({ expiryMonth: 5, expiryYear: 2024 }), now).expired).toBe(true);
  });

  it('never flags direct debits as expiring', () => {
    expect(toView(card({ kind: 'DIRECT_DEBIT', expiryMonth: null, expiryYear: null }), now)).toMatchObject({ expired: false, expiresSoon: false });
  });
});

describe('PaymentMethodsService.add', () => {
  it('makes the first method the default', async () => {
    const { service, repo, audit } = setup();
    await service.add(adminCtx(), cardInput);
    expect(repo.insert).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true, providerRef: 'pm_1' }), expect.anything());
    expect(audit.entries[0].action).toBe('payment_method.added');
  });

  it('stores only masked bank details for direct debits', async () => {
    const { service, repo, gateway } = setup([card()]);
    await service.add(adminCtx(), { kind: 'DIRECT_DEBIT', holderName: 'Acme Ltd', sortCode: '20-00-00', accountNumber: '55779911', makeDefault: true });
    expect(gateway.createMandate).toHaveBeenCalledWith(expect.objectContaining({ sortCode: '200000', accountNumber: '55779911' }));
    const inserted = repo.insert.mock.calls[0][0];
    expect(inserted).toMatchObject({ last4: '9911', sortCodeMasked: '**-**-00', isDefault: true });
    expect(JSON.stringify(inserted)).not.toContain('55779911');
    expect(repo.clearDefault).toHaveBeenCalled();
  });

  it('rejects expired cards before calling the provider', async () => {
    const { service, gateway } = setup();
    await expect(service.add(adminCtx(), { ...cardInput, expiryMonth: 1, expiryYear: 2024 })).rejects.toThrow(/expired/);
    expect(gateway.verifyCardToken).not.toHaveBeenCalled();
  });

  it('enforces the method limit', async () => {
    const { service } = setup(Array.from({ length: 5 }, (_, i) => card({ id: String(i) })));
    await expect(service.add(adminCtx(), cardInput)).rejects.toThrow(/at most 5/);
  });

  it('revokes the provider instrument when the local write fails', async () => {
    const { service, repo, gateway } = setup();
    repo.insert.mockRejectedValue(new Error('db down'));
    await expect(service.add(adminCtx(), cardInput)).rejects.toThrow('db down');
    expect(gateway.revoke).toHaveBeenCalledWith('pm_1');
  });
});

describe('PaymentMethodsService.setDefault', () => {
  it('refuses to make an expired card the default', async () => {
    const { service } = setup([card(), card({ id: 'old', isDefault: false, expiryMonth: 1, expiryYear: 2024 })]);
    await expect(service.setDefault(adminCtx(), 'old')).rejects.toThrow(/expired card/);
  });

  it('404s for unknown methods', async () => {
    const { service } = setup([card()]);
    await expect(service.setDefault(adminCtx(), 'missing')).rejects.toThrow(NotFoundError);
  });
});

describe('PaymentMethodsService.remove', () => {
  it('blocks removing the only method while services are live', async () => {
    const { service } = setup([card()]);
    await expect(service.remove(adminCtx(), card().id)).rejects.toThrow(/Add another payment method/);
  });

  it('requires a new default before removing the current one', async () => {
    const { service } = setup([card(), card({ id: 'second', isDefault: false })]);
    await expect(service.remove(adminCtx(), card().id)).rejects.toThrow(/different default/);
  });

  it('removes and revokes a non-default method', async () => {
    const { service, gateway, audit } = setup([card(), card({ id: 'second', isDefault: false })]);
    await service.remove(adminCtx(), 'second');
    expect(gateway.revoke).toHaveBeenCalledWith('ref_123');
    expect(audit.entries[0].action).toBe('payment_method.removed');
  });
});
```

## apps/gokinetic-business/api/src/modules/payments/payment-methods.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-methods.service.ts`.

```typescript
import { AuthContext } from '../../auth/permissions';
import { Db } from '../../db/query';
import { BusinessRuleError, NotFoundError } from '../../lib/errors';
import { Clock, MS_PER_DAY, systemClock } from '../../lib/dates';
import { logger } from '../../lib/logger';
import { AuditRepository } from '../audit/audit.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { PaymentGateway } from './payment-gateway';
import { NewPaymentMethod, PaymentMethodsRepository } from './payment-methods.repository';
import {
  AddPaymentMethodInput,
  EXPIRY_WARNING_DAYS,
  MAX_ACTIVE_PAYMENT_METHODS,
  PaymentMethod,
  PaymentMethodView
} from './payment-methods.types';

/** First instant after the card stops working: cards are valid through the end of the expiry month. */
export function cardExpiryInstant(month: number, year: number): Date {
  return new Date(Date.UTC(year, month, 1));
}

export function toView(method: PaymentMethod, now: Date): PaymentMethodView {
  if (method.kind !== 'CARD' || method.expiryMonth === null || method.expiryYear === null) {
    return { ...method, expired: false, expiresSoon: false };
  }
  const expiresAt = cardExpiryInstant(method.expiryMonth, method.expiryYear).getTime();
  const expired = expiresAt <= now.getTime();
  return { ...method, expired, expiresSoon: !expired && expiresAt - now.getTime() <= EXPIRY_WARNING_DAYS * MS_PER_DAY };
}

export function normaliseSortCode(raw: string): string {
  const digits = raw.replace(/[\s-]/g, '');
  if (!/^\d{6}$/.test(digits)) throw new BusinessRuleError('invalid-sort-code', 'Sort code must be 6 digits');
  return digits;
}

export function normaliseAccountNumber(raw: string): string {
  const digits = raw.replace(/\s/g, '');
  if (!/^\d{8}$/.test(digits)) throw new BusinessRuleError('invalid-account-number', 'Account number must be 8 digits');
  return digits;
}

export const maskSortCode = (sortCode: string): string => `**-**-${sortCode.slice(4)}`;

export class PaymentMethodsService {
  constructor(
    private readonly db: Db,
    private readonly repo: PaymentMethodsRepository,
    private readonly gateway: PaymentGateway,
    private readonly inventory: InventoryRepository,
    private readonly audit: AuditRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async list(ctx: AuthContext): Promise<PaymentMethodView[]> {
    const now = this.clock.now();
    return (await this.repo.listActive(ctx.accountId)).map((m) => toView(m, now));
  }

  async add(ctx: AuthContext, input: AddPaymentMethodInput): Promise<PaymentMethodView> {
    const now = this.clock.now();
    const existing = await this.repo.listActive(ctx.accountId);
    if (existing.length >= MAX_ACTIVE_PAYMENT_METHODS) {
      throw new BusinessRuleError('payment-method-limit', `An account can hold at most ${MAX_ACTIVE_PAYMENT_METHODS} payment methods`);
    }

    let record: Omit<NewPaymentMethod, 'isDefault'>;
    if (input.kind === 'CARD') {
      if (cardExpiryInstant(input.expiryMonth, input.expiryYear) <= now) {
        throw new BusinessRuleError('card-expired', 'This card has already expired');
      }
      const { reusableRef } = await this.gateway.verifyCardToken(input.providerToken);
      record = {
        accountId: ctx.accountId,
        kind: 'CARD',
        providerRef: reusableRef,
        holderName: input.holderName,
        cardBrand: input.cardBrand,
        last4: input.last4,
        expiryMonth: input.expiryMonth,
        expiryYear: input.expiryYear,
        sortCodeMasked: null,
        createdBy: ctx.userId
      };
    } else {
      const sortCode = normaliseSortCode(input.sortCode);
      const accountNumber = normaliseAccountNumber(input.accountNumber);
      const { mandateRef } = await this.gateway.createMandate({
        accountId: ctx.accountId,
        holderName: input.holderName,
        sortCode,
        accountNumber
      });
      record = {
        accountId: ctx.accountId,
        kind: 'DIRECT_DEBIT',
        providerRef: mandateRef,
        holderName: input.holderName,
        cardBrand: null,
        last4: accountNumber.slice(-4),
        expiryMonth: null,
        expiryYear: null,
        sortCodeMasked: maskSortCode(sortCode),
        createdBy: ctx.userId
      };
    }

    try {
      const created = await this.db.tx(async (tx) => {
        const locked = await this.repo.lockActive(ctx.accountId, tx);
        if (locked.length >= MAX_ACTIVE_PAYMENT_METHODS) {
          throw new BusinessRuleError('payment-method-limit', `An account can hold at most ${MAX_ACTIVE_PAYMENT_METHODS} payment methods`);
        }
        const becomesDefault = input.makeDefault || locked.length === 0;
        if (becomesDefault && locked.length > 0) await this.repo.clearDefault(ctx.accountId, tx);
        const method = await this.repo.insert({ ...record, isDefault: becomesDefault }, tx);
        await this.audit.record(
          {
            accountId: ctx.accountId,
            actorId: ctx.userId,
            action: 'payment_method.added',
            entity: 'payment_method',
            entityId: method.id,
            details: { kind: method.kind, last4: method.last4, isDefault: method.isDefault }
          },
          tx
        );
        return method;
      });
      return toView(created, now);
    } catch (err) {
      // Compensate: the provider instrument must not outlive a failed local write.
      await this.revokeQuietly(record.providerRef);
      throw err;
    }
  }

  async setDefault(ctx: AuthContext, id: string): Promise<PaymentMethodView[]> {
    const now = this.clock.now();
    await this.db.tx(async (tx) => {
      const methods = await this.repo.lockActive(ctx.accountId, tx);
      const target = methods.find((m) => m.id === id);
      if (!target) throw new NotFoundError('Payment method', id);
      if (target.isDefault) return;
      if (toView(target, now).expired) {
        throw new BusinessRuleError('card-expired', 'An expired card cannot be the default payment method');
      }
      await this.repo.setDefault(ctx.accountId, id, tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'payment_method.default_changed', entity: 'payment_method', entityId: id, details: { last4: target.last4 } },
        tx
      );
    });
    return this.list(ctx);
  }

  /**
   * Removes a method. The default can only be removed once another method is made default,
   * and the last method cannot be removed while the account still has billable services.
   */
  async remove(ctx: AuthContext, id: string): Promise<void> {
    const billable = (await this.inventory.allServices(ctx.accountId, null)).some(
      (s) => s.status === 'ACTIVE' || s.status === 'SUSPENDED'
    );
    const providerRef = await this.db.tx(async (tx) => {
      const methods = await this.repo.lockActive(ctx.accountId, tx);
      const target = methods.find((m) => m.id === id);
      if (!target) throw new NotFoundError('Payment method', id);
      if (methods.length === 1 && billable) {
        throw new BusinessRuleError('last-payment-method', 'Add another payment method before removing the only one on an account with live services');
      }
      if (target.isDefault && methods.length > 1) {
        throw new BusinessRuleError('reassign-default', 'Choose a different default payment method before removing this one');
      }
      const ref = await this.repo.markRemoved(ctx.accountId, id, this.clock.now(), tx);
      await this.audit.record(
        { accountId: ctx.accountId, actorId: ctx.userId, action: 'payment_method.removed', entity: 'payment_method', entityId: id, details: { last4: target.last4 } },
        tx
      );
      return ref;
    });
    await this.revokeQuietly(providerRef);
  }

  private async revokeQuietly(providerRef: string): Promise<void> {
    try {
      await this.gateway.revoke(providerRef);
    } catch (err) {
      logger.warn('payment instrument revocation failed; will be reconciled', { err });
    }
  }
}
```

## apps/gokinetic-business/api/src/modules/payments/payment-methods.types.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/payments/payment-methods.types.ts`.

```typescript
export const PAYMENT_METHOD_KINDS = ['CARD', 'DIRECT_DEBIT'] as const;
export type PaymentMethodKind = (typeof PAYMENT_METHOD_KINDS)[number];

export const CARD_BRANDS = ['VISA', 'MASTERCARD', 'AMEX'] as const;
export type CardBrand = (typeof CARD_BRANDS)[number];

export interface PaymentMethod {
  id: string;
  accountId: string;
  kind: PaymentMethodKind;
  holderName: string;
  cardBrand: CardBrand | null;
  last4: string;
  expiryMonth: number | null;
  expiryYear: number | null;
  sortCodeMasked: string | null;
  isDefault: boolean;
  createdAt: string;
}

export interface PaymentMethodView extends PaymentMethod {
  expired: boolean;
  expiresSoon: boolean;
}

/** Card details arrive already tokenised by the payment provider's hosted fields. */
export interface AddCardInput {
  kind: 'CARD';
  providerToken: string;
  holderName: string;
  cardBrand: CardBrand;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
  makeDefault: boolean;
}

/** Bank details are forwarded once to the gateway to create a mandate and are never stored. */
export interface AddDirectDebitInput {
  kind: 'DIRECT_DEBIT';
  holderName: string;
  sortCode: string;
  accountNumber: string;
  makeDefault: boolean;
}

export type AddPaymentMethodInput = AddCardInput | AddDirectDebitInput;

export const MAX_ACTIVE_PAYMENT_METHODS = 5;
/** Cards expiring within this many days are flagged in the portal. */
export const EXPIRY_WARNING_DAYS = 60;
```

## apps/gokinetic-business/api/src/modules/sla/sla.availability.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.availability.test.ts`.

```typescript
import { makeService } from '../../test/fixtures';
import { availabilityPolicy } from './sla.policy';
import {
  OutageWindow,
  availabilityMilliPct,
  creditBpsFor,
  measurementWindow,
  mergeIntervals,
  serviceAvailability
} from './sla.availability';

const JUNE_START = new Date('2024-06-01T00:00:00Z');
const JULY_START = new Date('2024-07-01T00:00:00Z');
const AFTER_JUNE = new Date('2024-07-05T00:00:00Z');
const SERVICE_ID = makeService().id;

function outage(start: string, end: string | null, planned = false): OutageWindow {
  return { serviceId: SERVICE_ID, startedAt: new Date(start), endedAt: end ? new Date(end) : null, planned };
}

describe('mergeIntervals', () => {
  it('merges overlapping and touching intervals', () => {
    expect(
      mergeIntervals([
        { start: 10, end: 20 },
        { start: 0, end: 5 },
        { start: 15, end: 30 },
        { start: 30, end: 35 }
      ])
    ).toEqual([
      { start: 0, end: 5 },
      { start: 10, end: 35 }
    ]);
  });

  it('drops empty intervals', () => {
    expect(mergeIntervals([{ start: 5, end: 5 }])).toEqual([]);
  });
});

describe('measurementWindow', () => {
  it('starts at activation for services activated mid-period', () => {
    const window = measurementWindow({ activatedAt: '2024-06-16T00:00:00.000Z', ceasedAt: null }, JUNE_START, JULY_START, AFTER_JUNE);
    expect(window?.start).toBe(Date.parse('2024-06-16T00:00:00Z'));
    expect(window?.end).toBe(JULY_START.getTime());
  });

  it('is null for services never activated or ceased before the period', () => {
    expect(measurementWindow({ activatedAt: null, ceasedAt: null }, JUNE_START, JULY_START, AFTER_JUNE)).toBeNull();
    expect(
      measurementWindow({ activatedAt: '2024-01-01T00:00:00.000Z', ceasedAt: '2024-05-01T00:00:00.000Z' }, JUNE_START, JULY_START, AFTER_JUNE)
    ).toBeNull();
  });

  it('stops at now for the current period', () => {
    const now = new Date('2024-06-10T00:00:00Z');
    expect(measurementWindow({ activatedAt: '2024-01-01T00:00:00.000Z', ceasedAt: null }, JUNE_START, JULY_START, now)?.end).toBe(now.getTime());
  });
});

describe('availabilityMilliPct', () => {
  it('floors to avoid over-reporting', () => {
    // 43,200 min month, 22 min down => 99.9490...%
    expect(availabilityMilliPct(43_200 * 60_000, 22 * 60_000)).toBe(99_949);
  });

  it('is 100% when nothing was measured', () => {
    expect(availabilityMilliPct(0, 0)).toBe(100_000);
  });
});

describe('creditBpsFor', () => {
  const policy = availabilityPolicy('ENHANCED');

  it.each([
    [99_950, 0],
    [99_899, 500],
    [99_400, 1_500],
    [90_000, 3_000]
  ])('availability %i => %i bps', (milliPct, bps) => {
    expect(creditBpsFor(policy, milliPct)).toBe(bps);
  });
});

describe('serviceAvailability', () => {
  const service = makeService({ activatedAt: '2024-01-10T00:00:00.000Z', monthlyChargeMinor: 12_000, slaTier: 'ENHANCED' });

  it('ignores planned work and merges overlapping unplanned outages', () => {
    const result = serviceAvailability(
      service,
      [
        outage('2024-06-10T10:00:00Z', '2024-06-10T11:00:00Z'),
        outage('2024-06-10T10:30:00Z', '2024-06-10T11:30:00Z'),
        outage('2024-06-12T01:00:00Z', '2024-06-12T05:00:00Z', true)
      ],
      JUNE_START,
      JULY_START,
      AFTER_JUNE
    )!;
    expect(result.downtimeMinutes).toBe(90);
    expect(result.plannedMinutes).toBe(240);
    expect(result.outageCount).toBe(1);
    expect(result.availabilityMilliPct).toBe(99_791);
    expect(result.met).toBe(false);
    expect(result.creditBps).toBe(500);
    expect(result.credit).toEqual({ amountMinor: 600, currency: 'GBP' });
  });

  it('clips outages that straddle the period boundary', () => {
    const result = serviceAvailability(service, [outage('2024-05-31T23:00:00Z', '2024-06-01T00:30:00Z')], JUNE_START, JULY_START, AFTER_JUNE)!;
    expect(result.downtimeMinutes).toBe(30);
  });

  it('counts an ongoing outage up to now', () => {
    const now = new Date('2024-06-20T12:00:00Z');
    const result = serviceAvailability(service, [outage('2024-06-20T10:00:00Z', null)], JUNE_START, JULY_START, now)!;
    expect(result.downtimeMinutes).toBe(120);
  });

  it('ignores outages belonging to other services', () => {
    const other: OutageWindow = { ...outage('2024-06-10T10:00:00Z', '2024-06-10T20:00:00Z'), serviceId: 'other' };
    expect(serviceAvailability(service, [other], JUNE_START, JULY_START, AFTER_JUNE)!.met).toBe(true);
  });
});
```

## apps/gokinetic-business/api/src/modules/sla/sla.availability.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.availability.ts`.

```typescript
import { CurrencyCode, Money, money, percentageOf } from '../../lib/money';
import { MS_PER_MINUTE } from '../../lib/dates';
import { Service } from '../inventory/inventory.types';
import { AvailabilityPolicy, availabilityPolicy } from './sla.policy';

export interface OutageWindow {
  serviceId: string;
  startedAt: Date;
  /** `null` while the outage is ongoing. */
  endedAt: Date | null;
  planned: boolean;
}

export interface Interval {
  start: number;
  end: number;
}

export interface ServiceAvailability {
  serviceId: string;
  productName: string;
  siteId: string;
  slaTier: Service['slaTier'];
  measuredMinutes: number;
  downtimeMinutes: number;
  plannedMinutes: number;
  outageCount: number;
  availabilityMilliPct: number;
  targetMilliPct: number;
  met: boolean;
  creditBps: number;
  credit: Money;
}

/** Merges overlapping or touching intervals so concurrent outages are not double counted. */
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals.filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  for (const current of sorted) {
    const last = merged[merged.length - 1];
    if (last && current.start <= last.end) last.end = Math.max(last.end, current.end);
    else merged.push({ ...current });
  }
  return merged;
}

function clip(outage: OutageWindow, window: Interval, now: Date): Interval {
  const end = (outage.endedAt ?? now).getTime();
  return { start: Math.max(outage.startedAt.getTime(), window.start), end: Math.min(end, window.end) };
}

function totalMs(intervals: Interval[]): number {
  return intervals.reduce((acc, i) => acc + (i.end - i.start), 0);
}

/**
 * The part of the reporting period during which the service was billable. A service
 * activated mid-month is measured only from activation; a ceased service only until cessation.
 */
export function measurementWindow(service: Pick<Service, 'activatedAt' | 'ceasedAt'>, periodStart: Date, periodEnd: Date, now: Date): Interval | null {
  const activated = service.activatedAt ? new Date(service.activatedAt).getTime() : null;
  if (activated === null) return null;
  const ceased = service.ceasedAt ? new Date(service.ceasedAt).getTime() : Infinity;
  const start = Math.max(periodStart.getTime(), activated);
  const end = Math.min(periodEnd.getTime(), ceased, now.getTime());
  return end > start ? { start, end } : null;
}

/** Availability in thousandths of a percent, floored so we never over-report. */
export function availabilityMilliPct(measuredMs: number, downtimeMs: number): number {
  if (measuredMs <= 0) return 100_000;
  const upMs = Math.max(0, measuredMs - downtimeMs);
  return Math.floor((upMs * 100_000) / measuredMs);
}

/** The highest credit band whose threshold the availability falls below, capped by policy. */
export function creditBpsFor(policy: AvailabilityPolicy, milliPct: number): number {
  const applicable = policy.creditBands.filter((band) => milliPct < band.belowMilliPct).map((band) => band.creditBps);
  return Math.min(policy.maxCreditBps, applicable.length ? Math.max(...applicable) : 0);
}

export function serviceAvailability(
  service: Service,
  outages: OutageWindow[],
  periodStart: Date,
  periodEnd: Date,
  now: Date
): ServiceAvailability | null {
  const window = measurementWindow(service, periodStart, periodEnd, now);
  if (!window) return null;
  const own = outages.filter((o) => o.serviceId === service.id);
  const unplanned = mergeIntervals(own.filter((o) => !o.planned).map((o) => clip(o, window, now)));
  const planned = mergeIntervals(own.filter((o) => o.planned).map((o) => clip(o, window, now)));
  const measuredMs = window.end - window.start;
  const downtimeMs = totalMs(unplanned);
  const policy = availabilityPolicy(service.slaTier);
  const milliPct = availabilityMilliPct(measuredMs, downtimeMs);
  const creditBps = creditBpsFor(policy, milliPct);

  return {
    serviceId: service.id,
    productName: service.productName,
    siteId: service.siteId,
    slaTier: service.slaTier,
    measuredMinutes: Math.round(measuredMs / MS_PER_MINUTE),
    downtimeMinutes: Math.round(downtimeMs / MS_PER_MINUTE),
    plannedMinutes: Math.round(totalMs(planned) / MS_PER_MINUTE),
    outageCount: unplanned.length,
    availabilityMilliPct: milliPct,
    targetMilliPct: policy.targetMilliPct,
    met: milliPct >= policy.targetMilliPct,
    creditBps,
    credit: percentageOf(money(service.monthlyChargeMinor, service.currency as CurrencyCode), creditBps)
  };
}
```

## apps/gokinetic-business/api/src/modules/sla/sla.clock.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.clock.test.ts`.

```typescript
import { addBusinessMinutes, alignToBusinessHours, businessMinutesBetween, dueDate, elapsedSlaMinutes } from './sla.clock';

const at = (iso: string) => new Date(iso);

describe('alignToBusinessHours', () => {
  it('keeps an instant already inside business hours', () => {
    expect(alignToBusinessHours(at('2024-06-04T10:15:00Z')).toISOString()).toBe('2024-06-04T10:15:00.000Z');
  });

  it('moves early-morning instants to opening time', () => {
    expect(alignToBusinessHours(at('2024-06-04T06:00:00Z')).toISOString()).toBe('2024-06-04T08:00:00.000Z');
  });

  it('moves evening and weekend instants to Monday opening', () => {
    expect(alignToBusinessHours(at('2024-06-07T19:00:00Z')).toISOString()).toBe('2024-06-10T08:00:00.000Z');
    expect(alignToBusinessHours(at('2024-06-09T12:00:00Z')).toISOString()).toBe('2024-06-10T08:00:00.000Z');
  });
});

describe('addBusinessMinutes', () => {
  it('stays within the same day when time allows', () => {
    expect(addBusinessMinutes(at('2024-06-04T09:00:00Z'), 120).toISOString()).toBe('2024-06-04T11:00:00.000Z');
  });

  it('carries the remainder into the next business day', () => {
    expect(addBusinessMinutes(at('2024-06-04T17:00:00Z'), 120).toISOString()).toBe('2024-06-05T09:00:00.000Z');
  });

  it('fast-forwards whole business days across a weekend', () => {
    // Thursday 12:00 + 20 business hours => Monday 12:00
    expect(addBusinessMinutes(at('2024-06-06T12:00:00Z'), 20 * 60).toISOString()).toBe('2024-06-10T12:00:00.000Z');
  });
});

describe('businessMinutesBetween', () => {
  it('counts only business minutes', () => {
    expect(businessMinutesBetween(at('2024-06-07T17:00:00Z'), at('2024-06-10T09:00:00Z'))).toBe(120);
  });

  it('is zero for reversed ranges', () => {
    expect(businessMinutesBetween(at('2024-06-10T09:00:00Z'), at('2024-06-07T17:00:00Z'))).toBe(0);
  });

  it('is the inverse of addBusinessMinutes', () => {
    const start = at('2024-06-05T15:20:00Z');
    expect(businessMinutesBetween(start, addBusinessMinutes(start, 1_234))).toBe(1_234);
  });
});

describe('dueDate / elapsedSlaMinutes', () => {
  it('adds wall-clock minutes for 24x7 targets', () => {
    expect(dueDate(at('2024-06-08T23:30:00Z'), 60, '24x7').toISOString()).toBe('2024-06-09T00:30:00.000Z');
  });

  it('shifts due dates by paused time', () => {
    expect(dueDate(at('2024-06-04T09:00:00Z'), 60, '24x7', 30 * 60_000).toISOString()).toBe('2024-06-04T10:30:00.000Z');
  });

  it('subtracts paused time from elapsed minutes', () => {
    expect(elapsedSlaMinutes(at('2024-06-04T09:00:00Z'), at('2024-06-04T12:00:00Z'), '24x7', 60 * 60_000)).toBe(120);
    expect(elapsedSlaMinutes(at('2024-06-04T09:00:00Z'), at('2024-06-04T12:00:00Z'), 'BUSINESS_HOURS', 60 * 60_000)).toBe(120);
  });
});
```

## apps/gokinetic-business/api/src/modules/sla/sla.clock.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.clock.ts`.

```typescript
import { MS_PER_MINUTE } from '../../lib/dates';
import { TicketSlaTarget } from './sla.policy';

export const BUSINESS_DAY_START_HOUR = 8;
export const BUSINESS_DAY_END_HOUR = 18;
const BUSINESS_MINUTES_PER_DAY = (BUSINESS_DAY_END_HOUR - BUSINESS_DAY_START_HOUR) * 60;

function isBusinessDay(d: Date): boolean {
  const day = d.getUTCDay();
  return day >= 1 && day <= 5;
}

function atUtcHour(d: Date, hour: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour, 0, 0, 0));
}

function nextDayStart(d: Date): Date {
  const next = atUtcHour(d, BUSINESS_DAY_START_HOUR);
  next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

/** Moves a timestamp forward to the next instant inside business hours (or returns it unchanged). */
export function alignToBusinessHours(start: Date): Date {
  let t = new Date(start.getTime());
  for (let guard = 0; guard < 14; guard++) {
    if (!isBusinessDay(t)) {
      t = nextDayStart(t);
      continue;
    }
    const open = atUtcHour(t, BUSINESS_DAY_START_HOUR);
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    if (t < open) return open;
    if (t >= close) {
      t = nextDayStart(t);
      continue;
    }
    return t;
  }
  return t;
}

/** Adds business minutes (Mon–Fri 08:00–18:00 UTC) to a start time. */
export function addBusinessMinutes(start: Date, minutes: number): Date {
  let t = alignToBusinessHours(start);
  let remaining = minutes;
  const fullDays = Math.floor(remaining / BUSINESS_MINUTES_PER_DAY);
  // Fast-forward whole business days; the loop below handles the partial remainder.
  for (let i = 0; i < fullDays; i++) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const minutesLeftToday = (close.getTime() - t.getTime()) / MS_PER_MINUTE;
    const offsetIntoDay = BUSINESS_MINUTES_PER_DAY - minutesLeftToday;
    t = alignToBusinessHours(nextDayStart(t));
    t = new Date(t.getTime() + offsetIntoDay * MS_PER_MINUTE);
    remaining -= BUSINESS_MINUTES_PER_DAY;
  }
  while (remaining > 0) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const available = (close.getTime() - t.getTime()) / MS_PER_MINUTE;
    if (remaining <= available) {
      return new Date(t.getTime() + remaining * MS_PER_MINUTE);
    }
    remaining -= available;
    t = alignToBusinessHours(nextDayStart(t));
  }
  return t;
}

/** Business minutes elapsed between two instants. */
export function businessMinutesBetween(from: Date, to: Date): number {
  if (to <= from) return 0;
  let total = 0;
  let t = alignToBusinessHours(from);
  while (t < to) {
    const close = atUtcHour(t, BUSINESS_DAY_END_HOUR);
    const end = close < to ? close : to;
    total += Math.max(0, (end.getTime() - t.getTime()) / MS_PER_MINUTE);
    if (close >= to) break;
    t = alignToBusinessHours(nextDayStart(t));
  }
  return Math.round(total);
}

/** Computes a due date by the policy's clock, extended by any paused (pending customer) time. */
export function dueDate(start: Date, minutes: number, clock: TicketSlaTarget['clock'], pausedMs = 0): Date {
  const shifted = new Date(start.getTime() + pausedMs);
  return clock === '24x7' ? new Date(shifted.getTime() + minutes * MS_PER_MINUTE) : addBusinessMinutes(shifted, minutes);
}

/** Minutes of the SLA clock consumed so far, excluding paused time. */
export function elapsedSlaMinutes(start: Date, now: Date, clock: TicketSlaTarget['clock'], pausedMs = 0): number {
  if (clock === '24x7') {
    return Math.max(0, Math.round((now.getTime() - start.getTime() - pausedMs) / MS_PER_MINUTE));
  }
  return Math.max(0, businessMinutesBetween(start, now) - Math.round(pausedMs / MS_PER_MINUTE));
}
```

## apps/gokinetic-business/api/src/modules/sla/sla.policy.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.policy.ts`.

```typescript
import { SlaTier } from '../inventory/inventory.types';

export type TicketPriority = 'P1' | 'P2' | 'P3' | 'P4';

export interface TicketSlaTarget {
  /** Minutes until first response is due. */
  responseMinutes: number;
  /** Minutes until resolution is due. */
  resolutionMinutes: number;
  /** 24x7 clocks run continuously; business-hours clocks only tick Mon–Fri 08:00–18:00 UTC. */
  clock: '24x7' | 'BUSINESS_HOURS';
}

export interface CreditBand {
  /** Availability strictly below this (in thousandths of a percent, e.g. 99_900 = 99.900%). */
  belowMilliPct: number;
  /** Credit as basis points of the service's monthly charge. */
  creditBps: number;
}

export interface AvailabilityPolicy {
  targetMilliPct: number;
  creditBands: CreditBand[];
  /** Upper bound on the credit for one service in one month, in basis points. */
  maxCreditBps: number;
}

const HOUR = 60;

const TICKET_TARGETS: Record<SlaTier, Record<TicketPriority, TicketSlaTarget>> = {
  STANDARD: {
    P1: { responseMinutes: 60, resolutionMinutes: 8 * HOUR, clock: '24x7' },
    P2: { responseMinutes: 2 * HOUR, resolutionMinutes: 24 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 8 * HOUR, resolutionMinutes: 30 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 16 * HOUR, resolutionMinutes: 50 * HOUR, clock: 'BUSINESS_HOURS' }
  },
  ENHANCED: {
    P1: { responseMinutes: 30, resolutionMinutes: 5 * HOUR, clock: '24x7' },
    P2: { responseMinutes: HOUR, resolutionMinutes: 12 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 4 * HOUR, resolutionMinutes: 20 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 8 * HOUR, resolutionMinutes: 40 * HOUR, clock: 'BUSINESS_HOURS' }
  },
  PREMIUM: {
    P1: { responseMinutes: 15, resolutionMinutes: 4 * HOUR, clock: '24x7' },
    P2: { responseMinutes: 30, resolutionMinutes: 8 * HOUR, clock: '24x7' },
    P3: { responseMinutes: 2 * HOUR, resolutionMinutes: 10 * HOUR, clock: 'BUSINESS_HOURS' },
    P4: { responseMinutes: 4 * HOUR, resolutionMinutes: 20 * HOUR, clock: 'BUSINESS_HOURS' }
  }
};

const AVAILABILITY: Record<SlaTier, AvailabilityPolicy> = {
  STANDARD: {
    targetMilliPct: 99_500,
    creditBands: [
      { belowMilliPct: 99_500, creditBps: 500 },
      { belowMilliPct: 99_000, creditBps: 1_000 },
      { belowMilliPct: 98_000, creditBps: 2_000 }
    ],
    maxCreditBps: 2_000
  },
  ENHANCED: {
    targetMilliPct: 99_900,
    creditBands: [
      { belowMilliPct: 99_900, creditBps: 500 },
      { belowMilliPct: 99_500, creditBps: 1_500 },
      { belowMilliPct: 99_000, creditBps: 3_000 }
    ],
    maxCreditBps: 3_000
  },
  PREMIUM: {
    targetMilliPct: 99_950,
    creditBands: [
      { belowMilliPct: 99_950, creditBps: 1_000 },
      { belowMilliPct: 99_900, creditBps: 2_500 },
      { belowMilliPct: 99_500, creditBps: 5_000 }
    ],
    maxCreditBps: 5_000
  }
};

export function ticketTarget(tier: SlaTier, priority: TicketPriority): TicketSlaTarget {
  return TICKET_TARGETS[tier][priority];
}

export function availabilityPolicy(tier: SlaTier): AvailabilityPolicy {
  return AVAILABILITY[tier];
}

/** Escalation thresholds as a fraction of the resolution target already consumed. */
export const ESCALATION_THRESHOLDS = [
  { level: 1, consumedBps: 5_000 },
  { level: 2, consumedBps: 7_500 },
  { level: 3, consumedBps: 10_000 }
] as const;

export const MAX_ESCALATION_LEVEL = 3;
```

## apps/gokinetic-business/api/src/modules/sla/sla.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.repository.ts`.

```typescript
import { Db } from '../../db/query';
import { TicketPriority } from './sla.policy';
import { OutageWindow } from './sla.availability';

export interface PriorityCompliance {
  priority: TicketPriority;
  resolvedCount: number;
  responseMetCount: number;
  resolutionMetCount: number;
}

interface OutageRow {
  service_id: string;
  started_at: Date;
  ended_at: Date | null;
  planned: boolean;
}

interface ComplianceRow {
  priority: TicketPriority;
  resolved_count: string;
  response_met: string;
  resolution_met: string;
}

export interface SlaRepository {
  /** Outages for the account's services overlapping [start, end). */
  outages(accountId: string, start: Date, end: Date, siteIds: string[] | null): Promise<OutageWindow[]>;
  /** Ticket SLA outcomes for tickets resolved within [start, end). */
  ticketCompliance(accountId: string, start: Date, end: Date, siteIds: string[] | null): Promise<PriorityCompliance[]>;
}

export function createSlaRepository(db: Db): SlaRepository {
  return {
    async outages(accountId, start, end, siteIds) {
      const rows = await db.many<OutageRow>(
        `SELECT o.service_id, o.started_at, o.ended_at, o.planned
           FROM service_outages o
           JOIN services s ON s.id = o.service_id
          WHERE s.account_id = $1
            AND o.started_at < $3
            AND (o.ended_at IS NULL OR o.ended_at > $2)
            AND ($4::uuid[] IS NULL OR s.site_id = ANY($4::uuid[]))
          ORDER BY o.started_at`,
        [accountId, start, end, siteIds]
      );
      return rows.map((r) => ({ serviceId: r.service_id, startedAt: r.started_at, endedAt: r.ended_at, planned: r.planned }));
    },

    async ticketCompliance(accountId, start, end, siteIds) {
      const rows = await db.many<ComplianceRow>(
        `SELECT priority,
                count(*) AS resolved_count,
                count(*) FILTER (WHERE first_response_at IS NOT NULL AND first_response_at <= response_due_at) AS response_met,
                count(*) FILTER (WHERE resolved_at <= resolution_due_at) AS resolution_met
           FROM tickets
          WHERE account_id = $1
            AND resolved_at >= $2 AND resolved_at < $3
            AND ($4::uuid[] IS NULL OR site_id IS NULL OR site_id = ANY($4::uuid[]))
          GROUP BY priority
          ORDER BY priority`,
        [accountId, start, end, siteIds]
      );
      return rows.map((r) => ({
        priority: r.priority,
        resolvedCount: Number(r.resolved_count),
        responseMetCount: Number(r.response_met),
        resolutionMetCount: Number(r.resolution_met)
      }));
    }
  };
}
```

## apps/gokinetic-business/api/src/modules/sla/sla.routes.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.routes.ts`.

```typescript
import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../lib/asyncHandler';
import { requireAuth, requirePermission } from '../../middleware/auth';
import { validate } from '../../middleware/validate';
import { SlaService } from './sla.service';

const PeriodParam = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'period must be YYYY-MM') });

export function slaRoutes(service: SlaService): Router {
  const router = Router();

  router.get(
    '/sla/policy',
    requirePermission('sla:read'),
    asyncHandler(async (req, res) => {
      res.json(await service.policy(requireAuth(req)));
    })
  );

  router.get(
    '/sla/reports/:period',
    requirePermission('sla:read'),
    validate({ params: PeriodParam }),
    asyncHandler(async (req, res) => {
      const report = await service.monthlyReport(requireAuth(req), req.params.period);
      // Closed periods are immutable; allow private caching of those only.
      res.setHeader('Cache-Control', report.provisional ? 'no-store' : 'private, max-age=3600');
      res.json(report);
    })
  );

  return router;
}
```

## apps/gokinetic-business/api/src/modules/sla/sla.service.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.service.test.ts`.

```typescript
import { BusinessRuleError } from '../../lib/errors';
import { fixedClock } from '../../lib/dates';
import { ACCOUNT_ID, SITE_A, SITE_B, adminCtx, makeService, userCtx } from '../../test/fixtures';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { SlaRepository } from './sla.repository';
import { SlaService, summariseCompliance, weightedAvailability } from './sla.service';
import { ServiceAvailability } from './sla.availability';

const SVC_1 = 'd1111111-1111-4111-8111-111111111111';
const SVC_2 = 'd2222222-2222-4222-8222-222222222222';

function setup(now = '2024-07-10T09:00:00.000Z') {
  const repo: jest.Mocked<SlaRepository> = {
    outages: jest.fn(async () => [
      { serviceId: SVC_1, startedAt: new Date('2024-06-10T10:00:00Z'), endedAt: new Date('2024-06-10T16:00:00Z'), planned: false }
    ]),
    ticketCompliance: jest.fn(async () => [{ priority: 'P2' as const, resolvedCount: 4, responseMetCount: 4, resolutionMetCount: 3 }])
  };
  const inventory = {
    allServices: jest.fn(async () => [
      makeService({ id: SVC_1, siteId: SITE_A, slaTier: 'STANDARD', monthlyChargeMinor: 10_000 }),
      makeService({ id: SVC_2, siteId: SITE_B, slaTier: 'PREMIUM', monthlyChargeMinor: 20_000 }),
      makeService({ id: 'pending', activatedAt: null, status: 'PENDING' })
    ])
  } as unknown as jest.Mocked<InventoryRepository>;
  const accounts = {
    get: jest.fn(async () => ({ id: ACCOUNT_ID, name: 'Acme', status: 'ACTIVE', currency: 'GBP', slaTier: 'ENHANCED', approvalThresholdMinor: 0 }))
  } as unknown as jest.Mocked<AccountsRepository>;
  return { repo, inventory, accounts, service: new SlaService(repo, inventory, accounts, fixedClock(now)) };
}

describe('summariseCompliance', () => {
  it('computes met ratios in basis points and leaves empty buckets null', () => {
    expect(summariseCompliance([{ priority: 'P1', resolvedCount: 3, responseMetCount: 2, resolutionMetCount: 3 }])[0]).toMatchObject({
      responseMetBps: 6_666,
      resolutionMetBps: 10_000
    });
    expect(summariseCompliance([{ priority: 'P4', resolvedCount: 0, responseMetCount: 0, resolutionMetCount: 0 }])[0].responseMetBps).toBeNull();
  });
});

describe('weightedAvailability', () => {
  it('weights by measured minutes', () => {
    const a = { measuredMinutes: 1_000, downtimeMinutes: 10 } as ServiceAvailability;
    const b = { measuredMinutes: 3_000, downtimeMinutes: 0 } as ServiceAvailability;
    expect(weightedAvailability([a, b])).toBe(99_750);
    expect(weightedAvailability([])).toBeNull();
  });
});

describe('SlaService.monthlyReport', () => {
  it('builds a closed-period report with credits for breached services', async () => {
    const { service } = setup();
    const report = await service.monthlyReport(adminCtx(), '2024-06');
    expect(report.provisional).toBe(false);
    expect(report.servicesMeasured).toBe(2);
    expect(report.servicesBreached).toBe(1);
    // 360 min down of 43,200 => 99.166% < 99.5% STANDARD target => 5% credit of £100
    expect(report.services[0]).toMatchObject({ serviceId: SVC_1, downtimeMinutes: 360, creditBps: 500 });
    expect(report.totalCredit).toEqual({ amountMinor: 500, currency: 'GBP' });
    expect(report.tickets[0].resolutionMetBps).toBe(7_500);
  });

  it('marks the current month as provisional', async () => {
    const { service } = setup('2024-06-15T00:00:00.000Z');
    expect((await service.monthlyReport(adminCtx(), '2024-06')).provisional).toBe(true);
  });

  it('restricts data to the caller site scope', async () => {
    const { service, repo, inventory } = setup();
    await service.monthlyReport(userCtx(), '2024-06');
    expect(inventory.allServices).toHaveBeenCalledWith(ACCOUNT_ID, [SITE_A]);
    expect(repo.outages).toHaveBeenCalledWith(ACCOUNT_ID, expect.any(Date), expect.any(Date), [SITE_A]);
  });

  it('rejects future and archived periods', async () => {
    const { service } = setup();
    await expect(service.monthlyReport(adminCtx(), '2024-08')).rejects.toThrow(BusinessRuleError);
    await expect(service.monthlyReport(adminCtx(), '2021-01')).rejects.toThrow(/last 24 months/);
  });
});

describe('SlaService.policy', () => {
  it('returns the targets for the account tier', async () => {
    const { service } = setup();
    const policy = await service.policy(adminCtx());
    expect(policy.tier).toBe('ENHANCED');
    expect(policy.tickets.P1.responseMinutes).toBe(30);
    expect(policy.availability.targetMilliPct).toBe(99_900);
  });
});
```

## apps/gokinetic-business/api/src/modules/sla/sla.service.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/sla/sla.service.ts`.

```typescript
import { AuthContext, siteFilterFor } from '../../auth/permissions';
import { BusinessRuleError } from '../../lib/errors';
import { Clock, parsePeriod, systemClock } from '../../lib/dates';
import { CurrencyCode, Money, sum } from '../../lib/money';
import { AccountsRepository } from '../accounts/accounts.repository';
import { InventoryRepository } from '../inventory/inventory.repository';
import { SlaTier } from '../inventory/inventory.types';
import { ServiceAvailability, serviceAvailability } from './sla.availability';
import { AvailabilityPolicy, TicketPriority, TicketSlaTarget, availabilityPolicy, ticketTarget } from './sla.policy';
import { PriorityCompliance, SlaRepository } from './sla.repository';

/** Reports older than this are archived and served from the documents store instead. */
export const SLA_REPORT_LOOKBACK_MONTHS = 24;

export interface ComplianceSummary extends PriorityCompliance {
  responseMetBps: number | null;
  resolutionMetBps: number | null;
}

export interface SlaReport {
  period: string;
  /** True while the period is still running; figures may change until month end. */
  provisional: boolean;
  generatedAt: string;
  services: ServiceAvailability[];
  servicesMeasured: number;
  servicesBreached: number;
  /** Availability weighted by measured minutes across all services, in thousandths of a percent. */
  overallAvailabilityMilliPct: number | null;
  totalCredit: Money;
  tickets: ComplianceSummary[];
}

export interface SlaPolicyView {
  tier: SlaTier;
  availability: AvailabilityPolicy;
  tickets: Record<TicketPriority, TicketSlaTarget>;
}

const PRIORITIES: TicketPriority[] = ['P1', 'P2', 'P3', 'P4'];

const ratioBps = (part: number, whole: number): number | null => (whole === 0 ? null : Math.floor((part * 10_000) / whole));

export function summariseCompliance(rows: PriorityCompliance[]): ComplianceSummary[] {
  return rows.map((r) => ({
    ...r,
    responseMetBps: ratioBps(r.responseMetCount, r.resolvedCount),
    resolutionMetBps: ratioBps(r.resolutionMetCount, r.resolvedCount)
  }));
}

export function weightedAvailability(services: ServiceAvailability[]): number | null {
  const measured = services.reduce((acc, s) => acc + s.measuredMinutes, 0);
  if (measured === 0) return null;
  const down = services.reduce((acc, s) => acc + s.downtimeMinutes, 0);
  return Math.floor(((measured - down) * 100_000) / measured);
}

function monthsBack(period: string, now: Date): number {
  const { year, month } = parsePeriod(period);
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

export class SlaService {
  constructor(
    private readonly repo: SlaRepository,
    private readonly inventory: InventoryRepository,
    private readonly accounts: AccountsRepository,
    private readonly clock: Clock = systemClock
  ) {}

  async monthlyReport(ctx: AuthContext, period: string): Promise<SlaReport> {
    const now = this.clock.now();
    const age = monthsBack(period, now);
    if (age < 0) throw new BusinessRuleError('future-period', 'SLA reports are not available for future periods');
    if (age > SLA_REPORT_LOOKBACK_MONTHS) {
      throw new BusinessRuleError('period-archived', `Online SLA reports cover the last ${SLA_REPORT_LOOKBACK_MONTHS} months`);
    }

    const { start, end } = parsePeriod(period);
    const scope = siteFilterFor(ctx);
    const [account, services, outages, compliance] = await Promise.all([
      this.accounts.get(ctx.accountId),
      this.inventory.allServices(ctx.accountId, scope),
      this.repo.outages(ctx.accountId, start, end, scope),
      this.repo.ticketCompliance(ctx.accountId, start, end, scope)
    ]);

    const measured = services
      .map((svc) => serviceAvailability(svc, outages, start, end, now))
      .filter((s): s is ServiceAvailability => s !== null)
      .sort((a, b) => a.availabilityMilliPct - b.availabilityMilliPct);

    return {
      period,
      provisional: age === 0,
      generatedAt: now.toISOString(),
      services: measured,
      servicesMeasured: measured.length,
      servicesBreached: measured.filter((s) => !s.met).length,
      overallAvailabilityMilliPct: weightedAvailability(measured),
      totalCredit: sum(measured.map((s) => s.credit), account.currency as CurrencyCode),
      tickets: summariseCompliance(compliance)
    };
  }

  async policy(ctx: AuthContext): Promise<SlaPolicyView> {
    const { slaTier } = await this.accounts.get(ctx.accountId);
    const tickets = Object.fromEntries(PRIORITIES.map((p) => [p, ticketTarget(slaTier, p)])) as Record<TicketPriority, TicketSlaTarget>;
    return { tier: slaTier, availability: availabilityPolicy(slaTier), tickets };
  }
}
```

## apps/gokinetic-business/api/src/modules/tickets/ticket-sla.test.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/ticket-sla.test.ts`.

```typescript
import { makeTicket } from '../../test/ticket-fixtures';
import { automaticEscalationLevel, computeDueDates, effectivePausedMs, slaView } from './ticket-sla';
import { canTransitionTicket, isClockRunning, nextStatusesFor } from './ticket-state-machine';

describe('computeDueDates', () => {
  it('uses a continuous clock for P2 standard tickets', () => {
    const due = computeDueDates('STANDARD', 'P2', new Date('2024-06-03T09:00:00Z'));
    expect(due.responseDueAt.toISOString()).toBe('2024-06-03T11:00:00.000Z');
    expect(due.resolutionDueAt.toISOString()).toBe('2024-06-04T09:00:00.000Z');
  });

  it('uses business hours for P3, rolling over the weekend', () => {
    // Friday 16:00 + 8 business hours => Monday 14:00
    const due = computeDueDates('STANDARD', 'P3', new Date('2024-06-07T16:00:00Z'));
    expect(due.responseDueAt.toISOString()).toBe('2024-06-10T14:00:00.000Z');
  });

  it('extends only the resolution target by paused time', () => {
    const opened = new Date('2024-06-03T09:00:00Z');
    const due = computeDueDates('PREMIUM', 'P1', opened, 30 * 60_000);
    expect(due.responseDueAt.toISOString()).toBe('2024-06-03T09:15:00.000Z');
    expect(due.resolutionDueAt.toISOString()).toBe('2024-06-03T13:30:00.000Z');
  });
});

describe('effectivePausedMs', () => {
  it('adds the open pending window to accumulated pause', () => {
    const t = makeTicket({ pausedMs: 60_000, pendingSince: '2024-06-03T10:00:00.000Z' });
    expect(effectivePausedMs(t, new Date('2024-06-03T10:05:00Z'))).toBe(6 * 60_000);
  });

  it('returns accumulated pause when not pending', () => {
    expect(effectivePausedMs(makeTicket({ pausedMs: 42 }), new Date())).toBe(42);
  });
});

describe('slaView', () => {
  it('reports on-track early in the life of a ticket', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T09:30:00Z'));
    expect(view.response.state).toBe('ON_TRACK');
    expect(view.response.consumedBps).toBe(2_500);
    expect(view.resolution.state).toBe('ON_TRACK');
  });

  it('flags at-risk once 75% of the response target is used', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T10:40:00Z'));
    expect(view.response.state).toBe('AT_RISK');
  });

  it('reports breached response after the due time without a reply', () => {
    const view = slaView(makeTicket(), new Date('2024-06-03T11:01:00Z'));
    expect(view.response.state).toBe('BREACHED');
  });

  it('reports MET when the first response landed before the due time', () => {
    const view = slaView(makeTicket({ firstResponseAt: '2024-06-03T10:00:00.000Z' }), new Date('2024-06-03T15:00:00Z'));
    expect(view.response.state).toBe('MET');
  });

  it('reports PAUSED resolution while waiting on the customer', () => {
    const ticket = makeTicket({ status: 'PENDING_CUSTOMER', pendingSince: '2024-06-03T10:00:00.000Z', firstResponseAt: '2024-06-03T09:10:00.000Z' });
    expect(slaView(ticket, new Date('2024-06-03T12:00:00Z')).resolution.state).toBe('PAUSED');
  });
});

describe('automaticEscalationLevel', () => {
  it.each([
    [0, 0],
    [4_999, 0],
    [5_000, 1],
    [7_500, 2],
    [12_000, 3]
  ])('maps %i bps consumed to level %i', (consumed, level) => {
    expect(automaticEscalationLevel(consumed)).toBe(level);
  });
});

describe('ticket state machine', () => {
  it('lets agents move work states but not customers', () => {
    expect(canTransitionTicket('OPEN', 'IN_PROGRESS', 'agent')).toBe(true);
    expect(canTransitionTicket('OPEN', 'IN_PROGRESS', 'customer')).toBe(false);
  });

  it('lets customers confirm or reopen a resolution', () => {
    expect(nextStatusesFor('RESOLVED', 'customer').sort()).toEqual(['CLOSED', 'IN_PROGRESS']);
  });

  it('treats CLOSED as terminal', () => {
    expect(nextStatusesFor('CLOSED', 'agent')).toEqual([]);
  });

  it('only runs the clock while the ticket is being worked', () => {
    expect(isClockRunning('OPEN')).toBe(true);
    expect(isClockRunning('PENDING_CUSTOMER')).toBe(false);
    expect(isClockRunning('RESOLVED')).toBe(false);
  });
});
```

## apps/gokinetic-business/api/src/modules/tickets/ticket-sla.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/ticket-sla.ts`.

```typescript
import { SlaTier } from '../inventory/inventory.types';
import { dueDate, elapsedSlaMinutes } from '../sla/sla.clock';
import { ESCALATION_THRESHOLDS, MAX_ESCALATION_LEVEL, TicketPriority, ticketTarget } from '../sla/sla.policy';
import { AT_RISK_BPS, SlaMeasureState, Ticket, TicketSlaView } from './tickets.types';

export interface DueDates {
  responseDueAt: Date;
  resolutionDueAt: Date;
}

/** Due dates for a ticket opened at `openedAt`, shifted by any time spent waiting on the customer. */
export function computeDueDates(tier: SlaTier, priority: TicketPriority, openedAt: Date, pausedMs = 0): DueDates {
  const target = ticketTarget(tier, priority);
  return {
    // Response is never paused: the first reply must come before we can ask the customer anything.
    responseDueAt: dueDate(openedAt, target.responseMinutes, target.clock),
    resolutionDueAt: dueDate(openedAt, target.resolutionMinutes, target.clock, pausedMs)
  };
}

/** Total paused time including an in-flight pending period. */
export function effectivePausedMs(ticket: Pick<Ticket, 'pausedMs' | 'pendingSince'>, now: Date): number {
  if (!ticket.pendingSince) return ticket.pausedMs;
  return ticket.pausedMs + Math.max(0, now.getTime() - new Date(ticket.pendingSince).getTime());
}

function consumedBps(elapsedMinutes: number, targetMinutes: number): number {
  if (targetMinutes <= 0) return 10_000;
  return Math.round((elapsedMinutes * 10_000) / targetMinutes);
}

function measureState(params: {
  completedAt: Date | null;
  dueAt: Date;
  now: Date;
  consumed: number;
  paused: boolean;
}): SlaMeasureState {
  if (params.completedAt) return params.completedAt <= params.dueAt ? 'MET' : 'BREACHED';
  if (params.now > params.dueAt) return 'BREACHED';
  if (params.paused) return 'PAUSED';
  return params.consumed >= AT_RISK_BPS ? 'AT_RISK' : 'ON_TRACK';
}

export function resolutionConsumedBps(ticket: Ticket, now: Date): number {
  const target = ticketTarget(ticket.slaTier, ticket.priority);
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : now;
  const elapsed = elapsedSlaMinutes(new Date(ticket.openedAt), end, target.clock, effectivePausedMs(ticket, end));
  return consumedBps(elapsed, target.resolutionMinutes);
}

export function slaView(ticket: Ticket, now: Date): TicketSlaView {
  const target = ticketTarget(ticket.slaTier, ticket.priority);
  const openedAt = new Date(ticket.openedAt);
  const responseEnd = ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : now;
  const responseConsumed = consumedBps(elapsedSlaMinutes(openedAt, responseEnd, target.clock), target.responseMinutes);
  const resolutionConsumed = resolutionConsumedBps(ticket, now);

  return {
    response: {
      dueAt: ticket.responseDueAt,
      consumedBps: responseConsumed,
      state: measureState({
        completedAt: ticket.firstResponseAt ? new Date(ticket.firstResponseAt) : null,
        dueAt: new Date(ticket.responseDueAt),
        now,
        consumed: responseConsumed,
        paused: false
      })
    },
    resolution: {
      dueAt: ticket.resolutionDueAt,
      consumedBps: resolutionConsumed,
      state: measureState({
        completedAt: ticket.resolvedAt ? new Date(ticket.resolvedAt) : null,
        dueAt: new Date(ticket.resolutionDueAt),
        now,
        consumed: resolutionConsumed,
        paused: ticket.status === 'PENDING_CUSTOMER'
      })
    }
  };
}

/** Escalation level implied purely by how much of the resolution target has been consumed. */
export function automaticEscalationLevel(consumed: number): number {
  let level = 0;
  for (const threshold of ESCALATION_THRESHOLDS) {
    if (consumed >= threshold.consumedBps) level = threshold.level;
  }
  return Math.min(level, MAX_ESCALATION_LEVEL);
}
```

## apps/gokinetic-business/api/src/modules/tickets/ticket-state-machine.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/ticket-state-machine.ts`.

```typescript
import { InvalidStateTransitionError } from '../../lib/errors';
import { TicketStatus } from './tickets.types';

/**
 * Ticket lifecycle: OPEN → IN_PROGRESS → PENDING_CUSTOMER → RESOLVED → CLOSED.
 *
 * Support agents drive work states. Customers may withdraw an OPEN ticket, confirm a
 * resolution (close it), reopen a recently resolved ticket, and implicitly hand a
 * PENDING_CUSTOMER ticket back to the agent by replying.
 */
export type TicketActor = 'customer' | 'agent';

const TRANSITIONS: Readonly<Record<TicketStatus, Partial<Record<TicketStatus, readonly TicketActor[]>>>> = {
  OPEN: {
    IN_PROGRESS: ['agent'],
    PENDING_CUSTOMER: ['agent'],
    RESOLVED: ['agent'],
    CLOSED: ['customer', 'agent']
  },
  IN_PROGRESS: {
    PENDING_CUSTOMER: ['agent'],
    RESOLVED: ['agent']
  },
  PENDING_CUSTOMER: {
    IN_PROGRESS: ['agent', 'customer'],
    RESOLVED: ['agent']
  },
  RESOLVED: {
    IN_PROGRESS: ['customer', 'agent'],
    CLOSED: ['customer', 'agent']
  },
  CLOSED: {}
};

export function canTransitionTicket(from: TicketStatus, to: TicketStatus, actor: TicketActor): boolean {
  return TRANSITIONS[from][to]?.includes(actor) ?? false;
}

export function assertTicketTransition(from: TicketStatus, to: TicketStatus, actor: TicketActor): void {
  if (!canTransitionTicket(from, to, actor)) throw new InvalidStateTransitionError('Ticket', from, to);
}

export function nextStatusesFor(from: TicketStatus, actor: TicketActor): TicketStatus[] {
  return (Object.entries(TRANSITIONS[from]) as Array<[TicketStatus, readonly TicketActor[]]>)
    .filter(([, actors]) => actors.includes(actor))
    .map(([status]) => status);
}

/** The SLA clock is stopped while the ticket waits on the customer or once it is resolved. */
export function isClockRunning(status: TicketStatus): boolean {
  return status === 'OPEN' || status === 'IN_PROGRESS';
}
```

## apps/gokinetic-business/api/src/modules/tickets/tickets.repository.ts

Application: Go Kinetic Business self-care (B2B). Stack: Angular 17 + Node.js/Express API. Language: typescript. Path: `apps/gokinetic-business/api/src/modules/tickets/tickets.repository.ts`.

```typescript
import { Db, WhereBuilder } from '../../db/query';
import { ConflictError } from '../../lib/errors';
import { Page, PageRequest, pageOf, toLimitOffset } from '../../lib/pagination';
import { SlaTier } from '../inventory/inventory.types';
import { TicketPriority } from '../sla/sla.policy';
import { Ticket, TicketCategory, TicketEvent, TicketEventKind, TicketStatus } from './tickets.types';

interface TicketRow {
  id: string;
  account_id: string;
  reference: string;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  service_id: string | null;
  site_id: string | null;
  subject: string;
  description: string;
  raised_by: string;
  contact_phone: string | null;
  escalation_level: number;
  sla_tier: SlaTier;
  opened_at: Date;
  first_response_at: Date | null;
  resolved_at: Date | null;
  closed_at: Date | null;
  pending_since: Date | null;
  paused_ms: string;
  response_due_at: Date;
  resolution_due_at: Date;
  version: number;
  total?: string;
}

interface EventRow {
  id: string;
  ticket_id: string;
  kind: TicketEventKind;
  author_id: string | null;
  body: string | null;
  from_value: string | null;
  to_value: string | null;
  internal: boolean;
  created_at: Date;
}

const iso = (d: Date | null): string | null => (d ? d.toISOString() : null);

export function toTicket(r: TicketRow): Ticket {
  return {
    id: r.id,
    accountId: r.account_id,
    reference: r.reference,
    category: r.category,
    priority: r.priority,
    status: r.status,
    serviceId: r.service_id,
    siteId: r.site_id,
    subject: r.subject,
    description: r.description,
    raisedBy: r.raised_by,
    contactPhone: r.contact_phone,
    escalationLevel: r.escalation_level,
    slaTier: r.sla_tier,
    openedAt: r.opened_at.toISOString(),
    firstResponseAt: iso(r.first_response_at),
    resolvedAt: iso(r.resolved_at),
    closedAt: iso(r.closed_at),
    pendingSince: iso(r.pending_since),
    pausedMs: Number(r.paused_ms),
    responseDueAt: r.response_due_at.toISOString(),
    resolutionDueAt: r.resolution_due_at.toISOString(),
    version: r.version
  };
}

function toEvent(r: EventRow): TicketEvent {
  return {
    id: Number(r.id),
    ticketId: r.ticket_id,
    kind: r.kind,
    authorId: r.author_id,
    body: r.body,
    fromValue: r.from_value,
    toValue: r.to_value,
    internal: r.internal,
    createdAt: r.created_at.toISOString()
  };
}

export interface TicketFilter {
  status?: TicketStatus;
  priority?: TicketPriority;
  category?: TicketCategory;
  siteId?: string;
  search?: string;
  /** Only tickets still being worked (OPEN, IN_PROGRESS, PENDING_CUSTOMER). */
  activeOnly?: boolean;
  siteIds: string[] | null;
}

export type NewTicket = Omit<
  Ticket,
  'id' | 'status' | 'escalationLevel' | 'firstResponseAt' | 'resolvedAt' | 'closedAt' | 'pendingSince' | 'pausedMs' | 'version'
>;

export type TicketPatch = Partial<
  Pick<
    Ticket,
    | 'status'
    | 'priority'
    | 'escalationLevel'
    | 'firstResponseAt'
    | 'resolvedAt'
    | 'closedAt'
    | 'pendingSince'
    | 'pausedMs'
    | 'responseDueAt'
    | 'resolutionDueAt'
  >
>;

export interface NewTicketEvent {
  ticketId: string;
  kind: TicketEventKind;
  authorId: string | null;
  body?: string | null;
  fromValue?: string | null;
  toValue?: string | null;
  internal?: boolean;
}

export interface TicketsRepository {
  list(accountId: string, filter: TicketFilter, page: PageRequest): Promise<Page<Ticket>>;
  find(accountId: string, ticketId: string, db?: Db): Promise<Ticket | null>;
  findOpenFaultForService(accountId: string, serviceId: string, db?: Db): Promise<Ticket | null>;
  insert(ticket: NewTicket, db: Db): Promise<Ticket>;
  /** Applies a patch only if the stored version matches; bumps the version. */
  update(ticketId: string, expectedVersion: number, patch: TicketPatch, db: Db): Promise<Ticket>;
  addEvent(event: NewTicketEvent, db: Db): Promise<TicketEvent>;
  events(ticketId: string, includeInternal: boolean): Promise<TicketEvent[]>;
  lastEventAt(ticketId: string, kind: TicketEventKind, db?: Db): Promise<Date | null>;
}

/** Column names for patchable fields; keeps the dynamic UPDATE free of user-controlled identifiers. */
const PATCH_COLUMNS: Record<keyof TicketPatch, string> = {
  status: 'status',
  priority: 'priority',
  escalationLevel: 'escalation_level',
  firstResponseAt: 'first_response_at',
  resolvedAt: 'resolved_at',
  closedAt: 'closed_at',
  pendingSince: 'pending_since',
  pausedMs: 'paused_ms',
  responseDueAt: 'response_due_at',
  resolutionDueAt: 'resolution_due_at'
};

export function createTicketsRepository(defaultDb: Db): TicketsRepository {
  return {
    async list(accountId, filter, page) {
      const where = new WhereBuilder()
        .add('account_id = ?', accountId)
        .add('status = ?', filter.status)
        .add('priority = ?', filter.priority)
        .add('category = ?', filter.category)
        .add('site_id = ?', filter.siteId);
      if (filter.activeOnly) where.addRaw(`status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER')`);
      if (filter.search) {
        const p = where.nextParam(`%${filter.search.toLowerCase()}%`);
        where.addRaw(`(lower(subject) LIKE ${p} OR lower(reference) LIKE ${p})`);
      }
      // Site-scoped users also see account-level tickets that are not tied to a site.
      if (filter.siteIds) where.addRaw(`(site_id IS NULL OR site_id = ANY(${where.nextParam(filter.siteIds)}::uuid[]))`);
      const { limit, offset } = toLimitOffset(page);
      const rows = await defaultDb.many<TicketRow>(
        `SELECT *, count(*) OVER() AS total FROM tickets ${where.toSql()}
          ORDER BY CASE WHEN status IN ('RESOLVED', 'CLOSED') THEN 1 ELSE 0 END, priority, opened_at DESC
          LIMIT ${where.nextParam(limit)} OFFSET ${where.nextParam(offset)}`,
        where.params
      );
      return pageOf(rows.map(toTicket), page, rows.length ? Number(rows[0].total) : 0);
    },

    async find(accountId, ticketId, db = defaultDb) {
      const row = await db.oneOrNone<TicketRow>('SELECT * FROM tickets WHERE account_id = $1 AND id = $2', [
        accountId,
        ticketId
      ]);
      return row ? toTicket(row) : null;
    },

    async findOpenFaultForService(accountId, serviceId, db = defaultDb) {
      const row = await db.oneOrNone<TicketRow>(
        `SELECT * FROM tickets
          WHERE account_id = $1 AND service_id = $2 AND category = 'FAULT'
            AND status IN ('OPEN', 'IN_PROGRESS', 'PENDING_CUSTOMER')
          ORDER BY opened_at DESC LIMIT 1`,
        [accountId, serviceId]
      );
      return row ? toTicket(row) : null;
    },

    async insert(t, db) {
      const row = await db.one<TicketRow>(
        `INSERT INTO tickets (account_id, reference, category, priority, status, service_id, site_id, subject, description,
                              raised_by, contact_phone, sla_tier, opened_at, response_due_at, resolution_due_at)
         VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          t.accountId,
          t.reference,
          t.category,
          t.priority,
          t.serviceId,
          t.siteId,
          t.subject,
          t.description,
          t.raisedBy,
          t.contactPhone,
          t.slaTier,
          t.openedAt,
          t.responseDueAt,
          t.resolutionDueAt
        ]
      );
      return toTicket(row);
    },

    async update(ticketId, expectedVersion, patch, db) {
      const sets: string[] = [];
      const params: unknown[] = [ticketId, expectedVersion];
      for (const [key, column] of Object.entries(PATCH_COLUMNS) as Array<[keyof TicketPatch, string]>) {
        if (!(key in patch)) continue;
        params.push(patch[key] ?? null);
        sets.push(`${column} = $${params.length}`);
      }
      sets.push('version = version + 1');
      const row = await db.oneOrNone<TicketRow>(
        `UPDATE tickets SET ${sets.join(', ')} WHERE id = $1 AND version = $2 RETURNING *`,
        params
      );
      if (!row) {
        throw new ConflictError('The ticket was changed by someone else; reload and try again', { ticketId });
      }
      return toTicket(row);
    },

    async addEvent(e, db) {
      const row = await db.one<EventRow>(
        `INSERT INTO ticket_events (ticket_id, kind, author_id, body, from_value, to_value, internal)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [e.ticketId, e.kind, e.authorId, e.body ?? null, e.fromValue ?? null, e.toValue ?? null, e.internal ?? false]
      );
      return toEvent(row);
    },

    async events(ticketId, includeInternal) {
      const rows = await defaultDb.many<EventRow>(
        `SELECT * FROM ticket_events WHERE ticket_id = $1 AND ($2::boolean OR internal = false) ORDER BY created_at, id`,
        [ticketId, includeInternal]
      );
      return rows.map(toEvent);
    },

    async lastEventAt(ticketId, kind, db = defaultDb) {
      const row = await db.oneOrNone<{ at: Date | null }>(
        'SELECT max(created_at) AS at FROM ticket_events WHERE ticket_id = $1 AND kind = $2',
        [ticketId, kind]
      );
      return row?.at ?? null;
    }
  };
}
```
