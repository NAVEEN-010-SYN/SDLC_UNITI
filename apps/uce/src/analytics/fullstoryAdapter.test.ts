import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FullStoryAdapter } from './fullstoryAdapter';

function setup() {
  const loader = vi.fn(async () => undefined);
  const adapter = new FullStoryAdapter({ orgId: 'o-ABC123-na1', loader });
  const queue = () => window.FS?.q ?? [];
  return { adapter, loader, queue };
}

describe('FullStoryAdapter', () => {
  beforeEach(() => {
    document.body.innerHTML = '<input type="email" id="email" /><textarea id="notes"></textarea><div data-account-number id="acc">ACC-1</div>';
    delete window._fs_org;
  });

  it('does not touch globals or load the snippet until enabled', () => {
    const { adapter, loader } = setup();
    adapter.track('plan_viewed', {});
    expect(window.FS).toBeUndefined();
    expect(window._fs_org).toBeUndefined();
    expect(loader).not.toHaveBeenCalled();
  });

  it('configures the snippet globals and loads fs.js on enable', async () => {
    const { adapter, loader } = setup();
    await adapter.enable();
    expect(window._fs_org).toBe('o-ABC123-na1');
    expect(window._fs_namespace).toBe('FS');
    expect(window._fs_host).toBe('fullstory.com');
    expect(loader).toHaveBeenCalledWith('https://edge.fullstory.com/s/fs.js', expect.objectContaining({ id: 'uce-fullstory' }));
  });

  it('applies privacy exclusions and masks', async () => {
    const { adapter } = setup();
    await adapter.enable();
    expect(document.getElementById('email')).toHaveClass('fs-exclude');
    expect(document.getElementById('acc')).toHaveClass('fs-exclude');
    expect(document.getElementById('notes')).toHaveClass('fs-mask');
  });

  it('uses the v2 API for identity, events and page properties', async () => {
    const { adapter, queue } = setup();
    await adapter.enable();
    adapter.identify({ userKey: 'hash-1', accountKey: 'hash-acc', segment: 'CONSUMER', roles: ['CONSUMER'] });
    adapter.track('referral_shared', { channel: 'email', 'bad-key': 1, phone: '07700900123', empty: null });
    adapter.page({ path: '/portals/uconnect', pageType: 'portals/uconnect', portal: 'uconnect' });

    expect(queue()).toEqual([
      ['setIdentity', { uid: 'hash-1', properties: { segment: 'CONSUMER', roles: 'CONSUMER', accountKey: 'hash-acc' } }],
      ['trackEvent', { name: 'referral_shared', properties: { channel: 'email', bad_key: 1 } }],
      ['setProperties', { type: 'page', properties: { pageName: 'portals/uconnect', portal: 'uconnect' } }],
    ]);
  });

  it('shuts down on revoke and restarts on re-grant without reloading the script', async () => {
    const { adapter, loader, queue } = setup();
    await adapter.enable();
    adapter.disable();
    expect(queue().at(-1)).toEqual(['shutdown', undefined]);
    adapter.track('ignored_event', {});
    expect(queue().some((c) => c[0] === 'trackEvent')).toBe(false);

    await adapter.enable();
    expect(queue().at(-1)).toEqual(['restart', undefined]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed org ids', () => {
    expect(() => new FullStoryAdapter({ orgId: 'x"; alert(1)' })).toThrow('Invalid FullStory org id');
  });
});
