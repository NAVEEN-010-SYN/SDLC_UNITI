import * as path from 'path';
import { env, Role } from './env';

export type PortalKey = 'ecom' | 'uconnect' | 'partner' | 'sdwan';

export interface PortalDefinition {
  key: PortalKey;
  displayName: string;
  baseURL: string;
  loginPath: string;
  landingPath: string;
  defaultRole: Role;
  storageState: string;
}

const authDir = path.resolve(__dirname, '../../.auth');

export function storageStatePath(portal: PortalKey, role: Role): string {
  return path.join(authDir, `${portal}.${role.toLowerCase()}.json`);
}

export const portals: Record<PortalKey, PortalDefinition> = {
  ecom: {
    key: 'ecom',
    displayName: 'GoKinetic eCom',
    baseURL: env.urls.ecom,
    loginPath: '/account/login',
    landingPath: '/account',
    defaultRole: 'CONSUMER',
    storageState: storageStatePath('ecom', 'CONSUMER'),
  },
  uconnect: {
    key: 'uconnect',
    displayName: 'Uconnect',
    baseURL: env.urls.uconnect,
    loginPath: '/signin',
    landingPath: '/dashboard',
    defaultRole: 'BUSINESS_ADMIN',
    storageState: storageStatePath('uconnect', 'BUSINESS_ADMIN'),
  },
  partner: {
    key: 'partner',
    displayName: 'Enterprise Partner Portal',
    baseURL: env.urls.partner,
    loginPath: '/login',
    landingPath: '/deals',
    defaultRole: 'PARTNER_ADMIN',
    storageState: storageStatePath('partner', 'PARTNER_ADMIN'),
  },
  sdwan: {
    key: 'sdwan',
    displayName: 'SD-WAN Portal',
    baseURL: env.urls.sdwan,
    loginPath: '/login',
    landingPath: '/sites',
    defaultRole: 'BUSINESS_ADMIN',
    storageState: storageStatePath('sdwan', 'BUSINESS_ADMIN'),
  },
};
