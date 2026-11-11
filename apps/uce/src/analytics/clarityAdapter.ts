import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { DEFAULT_PII_SELECTORS, observeMarking, sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * Microsoft Clarity adapter.
 *  - Installs the standard queueing stub so calls made before the tag loads are kept.
 *  - Signals consent through the Consent API v2 (analytics granted, ads denied).
 *  - Identifies with a hashed key only; Clarity's friendly name is never set.
 *  - Masks PII elements with data-clarity-mask, on top of Clarity's default masking.
 */

export type ClarityFn = ((...args: unknown[]) => void) & { q?: unknown[][] };

declare global {
  interface Window {
    clarity?: ClarityFn;
  }
}

export interface ClarityAdapterOptions {
  projectId: string;
  maskSelectors?: string[];
  win?: Window;
  loader?: ScriptLoader;
  nonce?: string;
}

const SCRIPT_ID = 'uce-clarity';
const MAX_TAG_LENGTH = 255;

export class ClarityAdapter implements AnalyticsAdapter {
  readonly name = 'clarity';
  readonly category = 'analytics' as const;
  private active = false;
  private stopMasking?: () => void;
  private readonly win: Window;
  private readonly loader: ScriptLoader;

  constructor(private readonly options: ClarityAdapterOptions) {
    if (!/^[a-z0-9]+$/i.test(options.projectId)) throw new Error('Invalid Clarity project id');
    this.win = options.win ?? window;
    this.loader = options.loader ?? loadScript;
  }

  async enable(): Promise<void> {
    if (this.active) return;
    this.installStub();
    this.call('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    this.stopMasking = observeMarking(this.win.document.body, this.options.maskSelectors ?? DEFAULT_PII_SELECTORS, (el) =>
      el.setAttribute('data-clarity-mask', 'true'),
    );
    this.active = true;
    await this.loader(`https://www.clarity.ms/tag/${this.options.projectId}`, { id: SCRIPT_ID, nonce: this.options.nonce });
  }

  disable(): void {
    if (!this.active) return;
    // Denying analytics storage makes Clarity delete its cookies and stop recording.
    this.call('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
    this.stopMasking?.();
    this.active = false;
  }

  identify(identity: AnalyticsIdentity): void {
    if (!this.active) return;
    this.call('identify', identity.userKey);
    this.setTag('segment', identity.segment);
    this.setTag('roles', identity.roles.join(','));
  }

  track(event: string, props: AnalyticsProps): void {
    if (!this.active) return;
    this.call('event', event);
    for (const [key, value] of Object.entries(sanitizeProps(props))) {
      if (value !== null && value !== undefined) this.setTag(`${event}.${key}`, String(value));
    }
  }

  page(props: PageProperties): void {
    if (!this.active) return;
    this.setTag('page_type', props.pageType);
    if (props.portal) this.setTag('portal', props.portal);
  }

  private setTag(key: string, value: string): void {
    this.call('set', key.slice(0, MAX_TAG_LENGTH), value.slice(0, MAX_TAG_LENGTH));
  }

  private installStub(): void {
    if (this.win.clarity) return;
    // Queues calls until the Clarity tag loads and replays them.
    const stub: ClarityFn = (...args: unknown[]) => {
      if (!stub.q) stub.q = [];
      stub.q.push(args);
    };
    this.win.clarity = stub;
  }

  private call(...args: unknown[]): void {
    this.win.clarity?.(...args);
  }
}
