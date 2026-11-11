import { Role, Segment } from '../auth/roles';
import { ConsentCategory } from '../consent/consentModel';

export type AnalyticsValue = string | number | boolean | null | undefined;
export type AnalyticsProps = Record<string, AnalyticsValue>;

/** Pseudonymous identity: never a raw user id, email or account number. */
export interface AnalyticsIdentity {
  userKey: string;
  accountKey?: string;
  segment: Segment;
  roles: Role[];
}

export interface PageProperties {
  path: string;
  pageType: string;
  portal?: string;
}

/**
 * Contract every vendor adapter implements. Adapters must be inert (no network,
 * no cookies, no globals) until enable() is called, which only happens once the
 * consent category they declare is granted.
 */
export interface AnalyticsAdapter {
  readonly name: string;
  readonly category: ConsentCategory;
  enable(): Promise<void>;
  disable(): void;
  identify(identity: AnalyticsIdentity): void;
  track(event: string, props: AnalyticsProps): void;
  page(props: PageProperties): void;
}
