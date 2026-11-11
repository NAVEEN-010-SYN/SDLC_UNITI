function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required environment variable ${name}; see .env.example`);
  }
  return value;
}

export interface PortalConfig {
  oidcAuthority: string;
  oidcClientId: string;
  oidcScope: string;
  rolesClaim: string;
  partnerClaim: string;
  apiBaseUrl: string;
}

let cached: PortalConfig | undefined;

export function config(): PortalConfig {
  if (!cached) {
    const env = import.meta.env;
    cached = {
      oidcAuthority: required('VITE_OIDC_AUTHORITY', env.VITE_OIDC_AUTHORITY).replace(/\/$/, ''),
      oidcClientId: required('VITE_OIDC_CLIENT_ID', env.VITE_OIDC_CLIENT_ID),
      oidcScope: env.VITE_OIDC_SCOPE || 'openid profile email',
      rolesClaim: env.VITE_JWT_ROLES_CLAIM || 'roles',
      partnerClaim: env.VITE_JWT_PARTNER_CLAIM || 'partner_id',
      apiBaseUrl: (env.VITE_API_BASE_URL || '').replace(/\/$/, ''),
    };
  }
  return cached;
}
