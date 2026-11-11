import { ValidationProblem } from '../errors/problem';
import { businessPolicySchema, createChangeRequestSchema, decisionSchema, firewallRuleSchema, paginationQuery, timeRangeQuery } from './schemas';
import { parse } from './validate';

function issues(fn: () => unknown): Array<{ path: string; message: string }> {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ValidationProblem);
    return (e as ValidationProblem).extensions.errors as Array<{ path: string; message: string }>;
  }
  throw new Error('expected validation to fail');
}

describe('request schemas', () => {
  it('coerces and bounds pagination', () => {
    expect(parse(paginationQuery, {})).toEqual({ page: 1, pageSize: 25 });
    expect(parse(paginationQuery, { page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
    expect(issues(() => parse(paginationQuery, { pageSize: '500' }))[0].path).toBe('pageSize');
  });

  it('defaults the time range to the last 24h and caps it at 93 days', () => {
    const r = parse(timeRangeQuery, { to: '2026-03-02T00:00:00Z' });
    expect(r.from).toBe('2026-03-01T00:00:00.000Z');
    expect(issues(() => parse(timeRangeQuery, { from: '2025-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }))[0].message).toMatch(/93 days/);
    expect(issues(() => parse(timeRangeQuery, { from: '2026-03-02' }))[0].message).toMatch(/timezone/);
  });

  it('requires a transport for transport steering and rejects unknown applications', () => {
    const base = { id: 'p', name: 'Backup', order: 1, match: { applications: ['veeam'] }, action: { serviceClass: 'BULK', priority: 'LOW', steering: 'PREFERRED_TRANSPORT' } };
    const errs = issues(() => parse(businessPolicySchema, base));
    expect(errs).toEqual([expect.objectContaining({ path: 'action.preferredTransport' })]);
    expect(issues(() => parse(businessPolicySchema, { ...base, match: { applications: ['tiktok'] }, action: { ...base.action, preferredTransport: 'MPLS' } }))[0].message).toMatch(/tiktok/);
  });

  it('forbids ports on ICMP firewall rules and malformed CIDRs', () => {
    const rule = { id: 'r', name: 'ping', sequence: 1, action: 'ALLOW', protocol: 'ICMP', sourceCidrs: ['10.0.0.0/8'], destinationCidrs: ['10.0.0.300/32'], destinationPorts: [{ from: 1, to: 2 }] };
    expect(issues(() => parse(firewallRuleSchema, rule)).map((i) => i.path).sort()).toEqual(['destinationCidrs.0']);
    expect(issues(() => parse(firewallRuleSchema, { ...rule, destinationCidrs: [] }))[0].path).toBe('destinationPorts');
  });

  it('enforces single-edge rollbacks, unique edges and justified rejections', () => {
    const cr = { title: 'Roll back', edgeIds: ['a', 'b'], payload: { type: 'CONFIG_ROLLBACK', backupId: 'BKP-1' } };
    expect(issues(() => parse(createChangeRequestSchema, cr))[0].message).toMatch(/exactly one edge/);
    expect(issues(() => parse(createChangeRequestSchema, { ...cr, edgeIds: ['a', 'a'] }))[0].message).toMatch(/unique/);
    expect(issues(() => parse(createChangeRequestSchema, { ...cr, edgeIds: ['a'], extra: 1 }))[0].message).toMatch(/Unrecognized key/);
    expect(issues(() => parse(decisionSchema, { decision: 'REJECT', comment: 'no' }))[0].path).toBe('comment');
    expect(parse(decisionSchema, { decision: 'APPROVE' })).toEqual({ decision: 'APPROVE' });
  });
});
