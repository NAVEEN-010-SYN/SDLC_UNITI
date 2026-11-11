import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClarityAdapter } from './clarityAdapter';

const identity = { userKey: 'a1b2c3', segment: 'BUSINESS' as const, roles: ['BUSINESS_ADMIN' as const] };

function setup() {
  const loader = vi.fn(async () => undefined);
  const adapter = new ClarityAdapter({ projectId: 'abc123xyz', loader });
  const calls = () => window.clarity?.q ?? [];
  return { adapter, loader, calls };
}

describe('ClarityAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input type="email" id="email" /><span data-pii id="name">Jane</span><p id="plain">Plan</p>';
  });

  it('is completely inert before enable: no global, no script, calls ignored', () => {
    const { adapter, loader } = setup();
    adapter.identify(identity);
    adapter.track('plan_viewed', {});
    expect(window.clarity).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it('installs the queue stub, grants analytics storage only, and loads the project tag', async () => {
    const { adapter, loader, calls } = setup();
    await adapter.enable();
    expect(calls()[0]).toEqual(['consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' }]);
    expect(loader).toHaveBeenCalledWith('https://www.clarity.ms/tag/abc123xyz', expect.objectContaining({ id: 'uce-clarity' }));
  });

  it('masks PII elements present now and added later', async () => {
    const { adapter } = setup();
    await adapter.enable();
    expect(document.getElementById('email')).toHaveAttribute('data-clarity-mask', 'true');
    expect(document.getElementById('name')).toHaveAttribute('data-clarity-mask', 'true');
    expect(document.getElementById('plain')).not.toHaveAttribute('data-clarity-mask');

    const late = document.createElement('div');
    late.innerHTML = '<input type="tel" id="phone" />';
    document.body.appendChild(late);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(document.getElementById('phone')).toHaveAttribute('data-clarity-mask', 'true');
  });

  it('identifies with the hashed key only and sets segment tags', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.identify(identity);
    expect(calls()).toContainEqual(['identify', 'a1b2c3']);
    expect(calls()).toContainEqual(['set', 'segment', 'BUSINESS']);
    expect(calls().find((c) => c[0] === 'identify')).toHaveLength(2);
  });

  it('sends events with sanitised properties as custom tags', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.track('ticket_raised', { priority: 'P3', email: 'jane@example.com', note: 'call 07700 900123' });
    expect(calls()).toContainEqual(['event', 'ticket_raised']);
    expect(calls()).toContainEqual(['set', 'ticket_raised.priority', 'P3']);
    expect(calls()).toContainEqual(['set', 'ticket_raised.note', 'call [PHONE]']);
    expect(JSON.stringify(calls())).not.toContain('jane@example.com');
  });

  it('denies storage on disable and stops forwarding', async () => {
    const { adapter, calls } = setup();
    await adapter.enable();
    adapter.disable();
    const count = calls().length;
    expect(calls()[count - 1]).toEqual(['consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }]);
    adapter.track('plan_viewed', {});
    expect(calls()).toHaveLength(count);
  });

  it('reuses an existing clarity global instead of replacing it', async () => {
    const existing = vi.fn();
    window.clarity = existing;
    const { adapter } = setup();
    await adapter.enable();
    expect(window.clarity).toBe(existing);
    expect(existing).toHaveBeenCalledWith('consentv2', expect.anything());
  });

  it('rejects malformed project ids to avoid script injection', () => {
    expect(() => new ClarityAdapter({ projectId: 'abc"/><script>' })).toThrow('Invalid Clarity project id');
  });
});
