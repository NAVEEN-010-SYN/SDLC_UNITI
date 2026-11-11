import { ConsentCategory } from '../consent/consentModel';
import { sanitizeProps } from './pii';
import { AnalyticsAdapter, AnalyticsIdentity, AnalyticsProps, PageProperties } from './types';

/**
 * Fans analytics calls out to vendor adapters, gated by consent.
 *
 * Events raised before consent are dropped, not queued: replaying behaviour
 * captured before an opt-in would defeat the purpose of asking. Only the
 * current identity and page context (needed to make later data usable) are
 * replayed to an adapter at the moment it is enabled.
 */

export interface AnalyticsServiceOptions {
  isGranted: (category: ConsentCategory) => boolean;
  onAdapterError?: (adapter: string, error: unknown) => void;
}

export class AnalyticsService {
  private readonly active = new Set<AnalyticsAdapter>();
  private identity?: AnalyticsIdentity;
  private currentPage?: PageProperties;
  private syncing: Promise<void> = Promise.resolve();

  constructor(
    private readonly adapters: AnalyticsAdapter[],
    private readonly options: AnalyticsServiceOptions,
  ) {}

  /** Enables/disables adapters to match current consent. Serialised to avoid double loads. */
  syncConsent(): Promise<void> {
    this.syncing = this.syncing.then(() => this.applyConsent());
    return this.syncing;
  }

  private async applyConsent(): Promise<void> {
    await Promise.all(this.adapters.map((adapter) => this.syncAdapter(adapter)));
  }

  /** Enables a newly granted adapter (replaying identity/page) or disables a revoked one. */
  private async syncAdapter(adapter: AnalyticsAdapter): Promise<void> {
    const granted = this.options.isGranted(adapter.category);
    const isActive = this.active.has(adapter);
    if (!granted && isActive) {
      this.active.delete(adapter);
      adapter.disable();
      return;
    }
    if (!granted || isActive) return;
    try {
      await adapter.enable();
      this.active.add(adapter);
      if (this.identity) adapter.identify(this.identity);
      if (this.currentPage) adapter.page(this.currentPage);
    } catch (error) {
      adapter.disable();
      this.options.onAdapterError?.(adapter.name, error);
    }
  }

  identify(identity: AnalyticsIdentity): void {
    this.identity = identity;
    this.forEachActive((a) => a.identify(identity));
  }

  /** Forgets the identity on logout; vendors start a fresh anonymous session. */
  reset(): void {
    this.identity = undefined;
    const wasActive = [...this.active];
    wasActive.forEach((a) => a.disable());
    this.active.clear();
    void this.syncConsent();
  }

  track(event: string, props: AnalyticsProps = {}): void {
    if (!/^[a-z][a-z0-9_]{1,63}$/.test(event)) {
      this.options.onAdapterError?.('analytics', new Error(`Invalid event name "${event}"`));
      return;
    }
    const clean = sanitizeProps(props);
    this.forEachActive((a) => a.track(event, clean));
  }

  page(props: PageProperties): void {
    this.currentPage = props;
    this.forEachActive((a) => a.page(props));
  }

  get activeAdapters(): string[] {
    return [...this.active].map((a) => a.name);
  }

  private forEachActive(fn: (adapter: AnalyticsAdapter) => void): void {
    for (const adapter of this.active) {
      try {
        fn(adapter);
      } catch (error) {
        this.options.onAdapterError?.(adapter.name, error);
      }
    }
  }
}

/** Derives a stable page type from a path, stripping identifiers so they never reach vendors. */
export function pageTypeFor(path: string): string {
  const segments: string[] = [];
  for (const part of path.split('/')) {
    if (!part) continue;
    segments.push(isIdentifierSegment(part) ? ':id' : part.toLowerCase());
  }
  if (segments.length === 0) return 'home';
  return segments.join('/');
}

/** Domain ids (ACC-/INV-/TKT-/ORD-), uuids/hex ids and plain numbers. */
function isIdentifierSegment(segment: string): boolean {
  if (/^(ACC|INV|TKT|ORD)-\d+$/i.test(segment)) return true;
  if (/^[0-9a-f-]{16,}$/i.test(segment)) return true;
  return /^\d+$/.test(segment);
}
