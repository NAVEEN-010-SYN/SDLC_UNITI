import { ApiClient, Page } from '../api/apiClient';
import { loadScript, ScriptLoader } from '../lib/scriptLoader';
import { Money, sumByCurrency } from '../lib/money';

/**
 * SaaSquatch referral programme integration.
 *
 * The browser never holds the tenant API key: the backend upserts the
 * participant and returns a signed user JWT (POST /referrals/token). The
 * widget is then rendered with squatch.js using that JWT. Rewards and referral
 * status come from our own API (which mirrors SaaSquatch webhooks), so they
 * work even when the widget is blocked or consent for it is withheld.
 */

export interface SquatchUser {
  id: string;
  accountId: string;
  firstName?: string;
  locale?: string;
}

export interface ReferralToken {
  jwt: string;
  user: SquatchUser;
  referralCode: string;
  /** Epoch seconds when the JWT expires. */
  expiresAt: number;
}

export type RewardStatus = 'PENDING' | 'AVAILABLE' | 'REDEEMED' | 'EXPIRED' | 'CANCELLED';

export interface Reward {
  id: string;
  type: 'ACCOUNT_CREDIT' | 'GIFT_CARD';
  amount: Money;
  status: RewardStatus;
  earnedAt: string;
  expiresAt?: string;
  referralId: string;
}

export type ReferralStatus = 'INVITED' | 'SIGNED_UP' | 'INSTALLED' | 'REWARDED' | 'EXPIRED' | 'CANCELLED';

export interface Referral {
  id: string;
  /** Masked by the backend, e.g. "J. S.". */
  refereeDisplayName: string;
  status: ReferralStatus;
  createdAt: string;
  updatedAt: string;
}

interface SquatchWidgetsApi {
  upsertUser(params: {
    user: SquatchUser;
    jwt: string;
    engagementMedium: 'EMBED' | 'POPUP';
    widgetType: string;
    container: HTMLElement | string;
  }): Promise<{ widget: unknown; user: { referralCode?: string } }>;
}

export interface SquatchGlobal {
  ready(callback: () => void): void;
  init(config: { tenantAlias: string }): void;
  widgets(): SquatchWidgetsApi;
}

declare global {
  interface Window {
    squatch?: SquatchGlobal;
  }
}

export const REFERRAL_STATUS_LABELS: Record<ReferralStatus, string> = {
  INVITED: 'Invited',
  SIGNED_UP: 'Ordered - awaiting installation',
  INSTALLED: 'Installed - reward on its way',
  REWARDED: 'Rewarded',
  EXPIRED: 'Expired',
  CANCELLED: 'Order cancelled',
};

/** Statuses that still count towards the customer's "in progress" referrals. */
const IN_PROGRESS: ReferralStatus[] = ['INVITED', 'SIGNED_UP', 'INSTALLED'];

export interface RewardSummary {
  available: Money[];
  redeemed: Money[];
  pendingCount: number;
}

export function summariseRewards(rewards: Reward[]): RewardSummary {
  return {
    available: sumByCurrency(rewards.filter((r) => r.status === 'AVAILABLE').map((r) => r.amount)),
    redeemed: sumByCurrency(rewards.filter((r) => r.status === 'REDEEMED').map((r) => r.amount)),
    pendingCount: rewards.filter((r) => r.status === 'PENDING').length,
  };
}

export function countInProgress(referrals: Referral[]): number {
  return referrals.filter((r) => IN_PROGRESS.includes(r.status)).length;
}

export interface ShareLinks {
  url: string;
  email: string;
  whatsapp: string;
  sms: string;
}

export function buildShareLinks(referralCode: string, shareBaseUrl: string): ShareLinks {
  if (!/^[A-Z0-9-]{4,32}$/i.test(referralCode)) throw new Error('Invalid referral code');
  const url = `${shareBaseUrl}?code=${encodeURIComponent(referralCode)}&utm_source=uce&utm_medium=referral`;
  const message = `I'm on Uniti full fibre - use my code ${referralCode} when you order and we both get a reward: ${url}`;
  return {
    url,
    email: `mailto:?subject=${encodeURIComponent('Get full fibre with Uniti')}&body=${encodeURIComponent(message)}`,
    whatsapp: `https://wa.me/?text=${encodeURIComponent(message)}`,
    sms: `sms:?&body=${encodeURIComponent(message)}`,
  };
}

export interface ReferralServiceOptions {
  api: ApiClient;
  tenantAlias?: string;
  widgetType: string;
  loader?: ScriptLoader;
  win?: Window;
  readyTimeoutMs?: number;
  nowSeconds?: () => number;
}

export class ReferralService {
  private token?: ReferralToken;
  private initialised = false;
  private readonly loader: ScriptLoader;
  private readonly win: Window;
  private readonly nowSeconds: () => number;

  constructor(private readonly options: ReferralServiceOptions) {
    this.loader = options.loader ?? loadScript;
    this.win = options.win ?? window;
    this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  }

  get widgetAvailable(): boolean {
    return Boolean(this.options.tenantAlias);
  }

  /** Cached until 60 s before expiry, so remounting the page doesn't re-mint tokens. */
  async getToken(): Promise<ReferralToken> {
    if (this.token && this.token.expiresAt - 60 > this.nowSeconds()) return this.token;
    this.token = await this.options.api.post<ReferralToken>('/referrals/token');
    return this.token;
  }

  async mountWidget(container: HTMLElement): Promise<{ referralCode: string }> {
    const tenantAlias = this.options.tenantAlias;
    if (!tenantAlias) throw new Error('Referral widget is not configured');
    const token = await this.getToken();
    await this.loader('https://fast.ssqt.io/squatch-js@2', { id: 'uce-saasquatch' });
    const squatch = await this.whenReady();
    if (!this.initialised) {
      squatch.init({ tenantAlias });
      this.initialised = true;
    }
    const result = await squatch.widgets().upsertUser({
      user: token.user,
      jwt: token.jwt,
      engagementMedium: 'EMBED',
      widgetType: this.options.widgetType,
      container,
    });
    return { referralCode: result.user.referralCode ?? token.referralCode };
  }

  listRewards(page = 1, pageSize = 20): Promise<Page<Reward>> {
    return this.options.api.get<Page<Reward>>('/referrals/rewards', { query: { page, pageSize } });
  }

  listReferrals(page = 1, pageSize = 20): Promise<Page<Referral>> {
    return this.options.api.get<Page<Referral>>('/referrals', { query: { page, pageSize } });
  }

  private whenReady(): Promise<SquatchGlobal> {
    return new Promise((resolve, reject) => {
      const squatch = this.win.squatch;
      if (!squatch) {
        reject(new Error('squatch.js did not initialise'));
        return;
      }
      const timer = setTimeout(() => reject(new Error('squatch.js ready timeout')), this.options.readyTimeoutMs ?? 10_000);
      squatch.ready(() => {
        clearTimeout(timer);
        resolve(squatch);
      });
    });
  }
}
