import { BusinessRuleError } from '../../lib/errors';
import { ACCOUNT_ID, ADMIN_ID, adminCtx } from '../../test/fixtures';
import { AuditRecord, AuditRepository } from './audit.repository';
import { AuditService, auditToCsv, csvField, describeAuditEntry } from './audit.service';

function record(overrides: Partial<AuditRecord> = {}): AuditRecord {
  return {
    id: 1,
    accountId: ACCOUNT_ID,
    actorId: ADMIN_ID,
    action: 'site.created',
    entity: 'site',
    entityId: 'x',
    details: { code: 'LDN-01' },
    correlationId: 'corr-12345678',
    createdAt: '2024-06-01T10:00:00.000Z',
    ...overrides
  };
}

describe('describeAuditEntry', () => {
  it('uses specific descriptions where known', () => {
    expect(describeAuditEntry(record())).toBe('Created site LDN-01');
    expect(
      describeAuditEntry(record({ action: 'user.role_changed', details: { from: { role: 'BUSINESS_USER' }, to: { role: 'BUSINESS_ADMIN' } } }))
    ).toBe("Changed a user's role from BUSINESS_USER to BUSINESS_ADMIN");
  });

  it('derives descriptions for state-machine actions', () => {
    expect(describeAuditEntry(record({ action: 'order.provisioning', details: {} }))).toBe('Moved an order to PROVISIONING');
    expect(describeAuditEntry(record({ action: 'ticket.pending_customer', details: {} }))).toBe('Moved a ticket to PENDING CUSTOMER');
  });

  it('falls back to the raw action', () => {
    expect(describeAuditEntry(record({ action: 'contract.renewed', details: {} }))).toBe('contract.renewed');
  });
});

describe('csvField', () => {
  it.each([
    ['plain', 'plain'],
    ['a,b', '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ['=SUM(A1)', "'=SUM(A1)"],
    ['-1,2', `"'-1,2"`]
  ])('escapes %s', (input, expected) => {
    expect(csvField(input)).toBe(expected);
  });
});

describe('auditToCsv', () => {
  it('writes a header and CRLF-terminated rows', () => {
    const csv = auditToCsv([{ ...record(), summary: 'Created site LDN-01' }]);
    expect(csv.split('\r\n')).toEqual([
      'timestamp,actor_id,action,entity,entity_id,summary,correlation_id',
      `2024-06-01T10:00:00.000Z,${ADMIN_ID},site.created,site,x,Created site LDN-01,corr-12345678`,
      ''
    ]);
  });
});

describe('AuditService.exportCsv', () => {
  function repoWith(total: number, perPage: (page: number) => number): jest.Mocked<AuditRepository> {
    return {
      record: jest.fn(),
      list: jest.fn(async (_acc, _filter, page) => ({
        items: Array.from({ length: perPage(page.page) }, (_, i) => record({ id: i })),
        page: page.page,
        pageSize: page.pageSize,
        total
      }))
    };
  }

  it('pages through results until a short page', async () => {
    const repo = repoWith(150, (p) => (p === 1 ? 100 : 50));
    const csv = await new AuditService(repo).exportCsv(adminCtx(), {});
    expect(repo.list).toHaveBeenCalledTimes(2);
    expect(csv.body.trim().split('\r\n')).toHaveLength(151);
    expect(csv.filename).toMatch(/^audit-ACC-10000001-\d{4}-\d{2}-\d{2}\.csv$/);
  });

  it('refuses exports beyond the row cap', async () => {
    const repo = repoWith(9_999, () => 100);
    await expect(new AuditService(repo).exportCsv(adminCtx(), {})).rejects.toThrow(BusinessRuleError);
  });
});
