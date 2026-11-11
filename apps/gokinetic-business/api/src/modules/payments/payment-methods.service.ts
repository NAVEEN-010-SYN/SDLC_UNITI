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
