import { describe, expect, it } from 'vitest';
import type { BusinessPolicy, FirewallRule } from '../api/types';
import { buildRule, EMPTY_RULE_FORM, nextSequence, normalizeCidr, parsePorts } from './firewallDraft';
import { formatBps, formatRelative } from './format';
import { describeChanges, movePolicy, removePolicy, summarizePolicyChanges, togglePolicy } from './policyDraft';

describe('format', () => {
  it.each([
    [0, '0 bps'],
    [950, '950 bps'],
    [1_500_000, '1.5 Mbps'],
    [1_000_000_000, '1 Gbps'],
    [250_000_000, '250 Mbps'],
  ])('formatBps(%d) = %s', (v, s) => expect(formatBps(v)).toBe(s));

  it('describes relative times in both directions', () => {
    const now = Date.parse('2026-03-02T12:00:00Z');
    expect(formatRelative('2026-03-02T11:59:30Z', now)).toBe('just now');
    expect(formatRelative('2026-03-02T09:00:00Z', now)).toBe('3 h ago');
    expect(formatRelative('2026-03-04T12:00:00Z', now)).toBe('2 d from now');
  });
});

describe('firewallDraft', () => {
  const rule = (sequence: number, o: Partial<FirewallRule> = {}): FirewallRule => ({
    id: `r${sequence}`, name: `r${sequence}`, sequence, enabled: true, action: 'ALLOW', protocol: 'TCP',
    sourceCidrs: ['10.0.0.0/24'], destinationCidrs: ['0.0.0.0/0'], destinationPorts: [], log: false, ...o,
  });
  const denyAll = rule(1000, { action: 'DENY', protocol: 'ANY', sourceCidrs: ['0.0.0.0/0'] });

  it('normalises addresses and rejects host bits past the prefix', () => {
    expect(normalizeCidr('192.168.1.10')).toBe('192.168.1.10/32');
    expect(normalizeCidr('10.0.0.0/8')).toBe('10.0.0.0/8');
    expect(normalizeCidr('10.0.0.1/24')).toBeNull();
    expect(normalizeCidr('300.1.1.1')).toBeNull();
  });

  it('parses port lists', () => {
    expect(parsePorts('80, 443 8000-8080')).toEqual([{ from: 80, to: 80 }, { from: 443, to: 443 }, { from: 8000, to: 8080 }]);
    expect(parsePorts('any')).toEqual([]);
    expect(parsePorts('9000-80')).toBeNull();
  });

  it('slots new rules above a trailing deny-all', () => {
    expect(nextSequence([])).toBe(10);
    expect(nextSequence([rule(10), rule(20)])).toBe(30);
    expect(nextSequence([rule(10), denyAll])).toBe(20);
  });

  it('validates the form like the API schema', () => {
    const { errors } = buildRule({ ...EMPTY_RULE_FORM, name: 'r10', protocol: 'ICMP', sources: '10.0.0.5/8', ports: '22' }, [rule(10)], 'n1');
    expect(errors).toEqual({ name: expect.stringMatching(/already exists/), sources: expect.stringMatching(/10.0.0.5\/8/), ports: 'ICMP rules cannot specify ports' });
    const ok = buildRule({ ...EMPTY_RULE_FORM, name: 'https', ports: '443' }, [rule(10), denyAll], 'n2');
    expect(ok.rule).toMatchObject({ sequence: 20, sourceCidrs: ['0.0.0.0/0'], destinationPorts: [{ from: 443, to: 443 }] });
  });
});

describe('policyDraft', () => {
  const p = (id: string, order: number): BusinessPolicy => ({
    id, name: id, order, enabled: true, match: {}, action: { serviceClass: 'BULK', priority: 'LOW', steering: 'BEST_PATH' },
  });
  const base = [p('voice', 10), p('saas', 20), p('backup', 30)];

  it('moves and renumbers, ignoring moves past the ends', () => {
    expect(movePolicy(base, 2, -1).map((x) => [x.id, x.order])).toEqual([['voice', 10], ['backup', 20], ['saas', 30]]);
    expect(movePolicy(base, 0, -1)).toBe(base);
  });

  it('summarises a draft against the live set', () => {
    const draft = togglePolicy(removePolicy(movePolicy(base, 1, 1), 'voice'), 'backup');
    const s = summarizePolicyChanges(base, draft);
    expect(s).toEqual({ added: [], removed: ['voice'], reordered: true, toggled: ['backup'] });
    expect(describeChanges(s)).toBe('Remove voice; toggle backup; reorder');
    expect(describeChanges(summarizePolicyChanges(base, base))).toBe('No changes');
  });
});
