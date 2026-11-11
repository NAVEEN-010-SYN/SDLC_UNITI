/**
 * Typed runtime configuration read from Vite env variables (see .env.example).
 * Fails fast on missing required values so a misconfigured build never ships
 * half-working auth.
 */

export type PortalId = 'ecom' | 'uconnect' | 'gokinetic-business' | 'partner' | 'sdwan' | 'hosted-services' | 'wholesale';

export interface UceConfig {
  apiBaseUrl: string;
  apiTimeoutMs: number;
  oidc: {
    issuer: string;
    clientId: string;
    redirectUri: string;
    postLogoutRedirectUri: string;
    scope: string;
  };
  consentPolicyVersion: string;
  analytics: {
    clarityProjectId?: string;
    fullstoryOrgId?: string;
    fullstoryHost: string;
    idSalt: string;
  };
  referrals: {
    tenantAlias?: string;
    widgetType: string;
    shareBaseUrl: string;
  };
  portalUrls: Partial<Record<PortalId, string>>;
  flagOverrides: Record<string, boolean>;
}

export class ConfigError extends Error {}

type Env = Record<string, string | boolean | undefined>;

function str(env: Env, key: string): string | undefined {
  const value = env[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

/** Parses "a=true,b=false" into a flag map; unknown values are rejected. */
export function parseFlagOverrides(raw: string | undefined): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  if (!raw) return result;
  for (const pair of raw.split(',')) {
    const [key, value] = pair.split('=').map((s) => s.trim());
    if (!key) continue;
    if (value !== 'true' && value !== 'false') throw new ConfigError(`VITE_FEATURE_FLAGS: "${key}" must be true or false`);
    result[key] = value === 'true';
  }
  return result;
}

const PORTAL_ENV: Record<PortalId, string> = {
  ecom: 'VITE_PORTAL_ECOM_URL',
  uconnect: 'VITE_PORTAL_UCONNECT_URL',
  'gokinetic-business': 'VITE_PORTAL_GOKINETIC_BUSINESS_URL',
  partner: 'VITE_PORTAL_PARTNER_URL',
  sdwan: 'VITE_PORTAL_SDWAN_URL',
  'hosted-services': 'VITE_PORTAL_HOSTED_SERVICES_URL',
  wholesale: 'VITE_PORTAL_WHOLESALE_URL',
};

export function loadConfig(env: Env = import.meta.env): UceConfig {
  const missing = ['VITE_API_BASE_URL', 'VITE_OIDC_ISSUER', 'VITE_OIDC_CLIENT_ID', 'VITE_OIDC_REDIRECT_URI'].filter((k) => !str(env, k));
  if (missing.length > 0) throw new ConfigError(`Missing required configuration: ${missing.join(', ')}`);

  const timeout = Number(str(env, 'VITE_API_TIMEOUT_MS') ?? 10_000);
  if (!Number.isInteger(timeout) || timeout <= 0) throw new ConfigError('VITE_API_TIMEOUT_MS must be a positive integer');

  const portalUrls: UceConfig['portalUrls'] = {};
  for (const [id, key] of Object.entries(PORTAL_ENV) as Array<[PortalId, string]>) {
    const url = str(env, key);
    if (url) portalUrls[id] = url;
  }

  return {
    apiBaseUrl: str(env, 'VITE_API_BASE_URL')!.replace(/\/+$/, ''),
    apiTimeoutMs: timeout,
    oidc: {
      issuer: str(env, 'VITE_OIDC_ISSUER')!.replace(/\/+$/, ''),
      clientId: str(env, 'VITE_OIDC_CLIENT_ID')!,
      redirectUri: str(env, 'VITE_OIDC_REDIRECT_URI')!,
      postLogoutRedirectUri: str(env, 'VITE_OIDC_POST_LOGOUT_REDIRECT_URI') ?? '/',
      scope: str(env, 'VITE_OIDC_SCOPE') ?? 'openid profile email',
    },
    consentPolicyVersion: str(env, 'VITE_CONSENT_POLICY_VERSION') ?? '1',
    analytics: {
      clarityProjectId: str(env, 'VITE_CLARITY_PROJECT_ID'),
      fullstoryOrgId: str(env, 'VITE_FULLSTORY_ORG_ID'),
      fullstoryHost: str(env, 'VITE_FULLSTORY_HOST') ?? 'fullstory.com',
      idSalt: str(env, 'VITE_ANALYTICS_ID_SALT') ?? 'uce',
    },
    referrals: {
      tenantAlias: str(env, 'VITE_SAASQUATCH_TENANT_ALIAS'),
      widgetType: str(env, 'VITE_SAASQUATCH_WIDGET_TYPE') ?? 'p/referral-program/w/referrerWidget',
      shareBaseUrl: str(env, 'VITE_REFERRAL_SHARE_BASE_URL') ?? 'https://www.gokinetic.example/refer',
    },
    portalUrls,
    flagOverrides: parseFlagOverrides(str(env, 'VITE_FEATURE_FLAGS')),
  };
}
