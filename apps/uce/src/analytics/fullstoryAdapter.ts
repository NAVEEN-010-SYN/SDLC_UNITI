import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { DEFAULT_PII_SELECTORS, observeMarking, sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * FullStory (Browser API v2) adapter.
 *  - Sets the _fs_* globals and a queueing FS() stub exactly as the official snippet does.
 *  - Privacy exclusions: PII elements get .fs-exclude (never captured), and
 *    free-text inputs get .fs-mask (structure captured, text masked).
 *  - On revoke calls FS('shutdown'); a later re-grant calls FS('restart').
 */

export type FsFn = ((operation: string, payload?: unknown) => unknown) & { q?: unknown[][] };

declare global {
  interface Window {
    FS?: FsFn;
    _fs_host?: string;
    _fs_script?: string;
    _fs_org?: string;
    _fs_namespace?: string;
  }
}

export interface FullStoryAdapterOptions {
  orgId: string;
  host?: string;
  excludeSelectors?: string[];
  maskSelectors?: string[];
  win?: Window;
  loader?: ScriptLoader;
  nonce?: string;
}

const SCRIPT_ID = 'uce-fullstory';
const DEFAULT_MASK_SELECTORS = ['textarea', 'input[type="text"]', '[data-free-text]'];

/** FullStory custom properties must be flat scalars; null/undefined are dropped. */
function toFsProperties(props: AnalyticsProps): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(sanitizeProps(props))) {
    if (value !== null && value !== undefined) out[key.replace(/[^A-Za-z0-9_]/g, '_')] = value;
  }
  return out;
}

export class FullStoryAdapter implements AnalyticsAdapter {
  readonly name = 'fullstory';
  readonly category = 'analytics' as const;
  private active = false;
  private everStarted = false;
  private cleanups: Array<() => void> = [];
  private readonly win: Window;
  private readonly loader: ScriptLoader;

  constructor(private readonly options: FullStoryAdapterOptions) {
    if (!/^[A-Za-z0-9-]+$/.test(options.orgId)) throw new Error('Invalid FullStory org id');
    this.win = options.win ?? window;
    this.loader = options.loader ?? loadScript;
  }

  async enable(): Promise<void> {
    if (this.active) return;
    this.applyPrivacyClasses();
    this.active = true;
    if (this.everStarted && this.win.FS) {
      this.win.FS('restart');
      return;
    }
    const host = this.options.host ?? 'fullstory.com';
    this.win._fs_host = host;
    this.win._fs_script = 'edge.fullstory.com/s/fs.js';
    this.win._fs_org = this.options.orgId;
    this.win._fs_namespace = 'FS';
    if (!this.win.FS) {
      const stub: FsFn = (operation, payload) => {
        (stub.q = stub.q ?? []).push([operation, payload]);
        return undefined;
      };
      this.win.FS = stub;
    }
    this.everStarted = true;
    await this.loader(`https://${this.win._fs_script}`, { id: SCRIPT_ID, nonce: this.options.nonce, attributes: { 'data-org': this.options.orgId } });
  }

  disable(): void {
    if (!this.active) return;
    this.win.FS?.('shutdown');
    this.cleanups.forEach((stop) => stop());
    this.cleanups = [];
    this.active = false;
  }

  identify(identity: AnalyticsIdentity): void {
    if (!this.active) return;
    this.win.FS?.('setIdentity', {
      uid: identity.userKey,
      properties: { segment: identity.segment, roles: identity.roles.join(','), ...(identity.accountKey ? { accountKey: identity.accountKey } : {}) },
    });
  }

  track(event: string, props: AnalyticsProps): void {
    if (!this.active) return;
    this.win.FS?.('trackEvent', { name: event, properties: toFsProperties(props) });
  }

  page(props: PageProperties): void {
    if (!this.active) return;
    this.win.FS?.('setProperties', {
      type: 'page',
      properties: { pageName: props.pageType, ...(props.portal ? { portal: props.portal } : {}) },
    });
  }

  private applyPrivacyClasses(): void {
    const body = this.win.document.body;
    this.cleanups.push(
      observeMarking(body, this.options.excludeSelectors ?? DEFAULT_PII_SELECTORS, (el) => el.classList.add('fs-exclude')),
      observeMarking(body, this.options.maskSelectors ?? DEFAULT_MASK_SELECTORS, (el) => el.classList.add('fs-mask')),
    );
  }
}
