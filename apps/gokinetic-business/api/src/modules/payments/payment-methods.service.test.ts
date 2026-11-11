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
