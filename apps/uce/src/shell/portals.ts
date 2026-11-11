import { hasAnyRole, Role } from '../auth/roles';
import { PortalId, UceConfig } from '../config';

/**
 * Registry of the portals the shell hosts. "embed" portals render inside the
 * shell (same SSO session, shared header); "link" portals open in a new tab
 * because they set frame-ancestors restrictions or run their own chrome.
 */

export interface PortalDefinition {
  id: PortalId;
  name: string;
  description: string;
  roles: Role[];
  mode: 'embed' | 'link';
}

const BUSINESS: Role[] = ['BUSINESS_ADMIN', 'BUSINESS_USER'];
const PARTNER: Role[] = ['PARTNER_ADMIN', 'PARTNER_AGENT'];

export const PORTALS: PortalDefinition[] = [
  { id: 'ecom', name: 'Shop & orders', description: 'Browse broadband plans and track orders', roles: ['CONSUMER', ...BUSINESS], mode: 'embed' },
  { id: 'uconnect', name: 'My services & billing', description: 'Manage services, invoices and support tickets', roles: ['CONSUMER', ...BUSINESS], mode: 'embed' },
  { id: 'gokinetic-business', name: 'Go Kinetic Business', description: 'Business self-care for sites and users', roles: BUSINESS, mode: 'embed' },
  { id: 'sdwan', name: 'SD-WAN', description: 'VeloCloud and Fortinet edge management', roles: BUSINESS, mode: 'link' },
  { id: 'hosted-services', name: 'Hosted services', description: 'Hosted voice, email and web hosting', roles: BUSINESS, mode: 'embed' },
  { id: 'partner', name: 'Partner portal', description: 'Enterprise partner orders and commissions', roles: PARTNER, mode: 'link' },
  { id: 'wholesale', name: 'iConnect Wholesale', description: 'Wholesale ordering', roles: ['WHOLESALE_BUYER'], mode: 'link' },
];

export interface ResolvedPortal extends PortalDefinition {
  url: string;
}

/** Portals the user may open and that are configured for this environment. */
export function portalsFor(roles: Role[], urls: UceConfig['portalUrls']): ResolvedPortal[] {
  const isAgent = roles.includes('SUPPORT_AGENT');
  return PORTALS.filter((p) => urls[p.id] && (isAgent || hasAnyRole(roles, p.roles))).map((p) => ({ ...p, url: urls[p.id]! }));
}

/**
 * Builds the embed URL, passing only non-sensitive context. Tokens are never
 * put in URLs; embedded portals obtain their own via silent SSO.
 */
export function embedUrl(portal: ResolvedPortal, subPath: string, accountId: string | undefined): string {
  const url = new URL(portal.url);
  const clean = subPath.replace(/^\/+/, '');
  if (clean && !clean.split('/').includes('..')) url.pathname = `${url.pathname.replace(/\/$/, '')}/${clean}`;
  url.searchParams.set('embedded', 'uce');
  if (accountId) url.searchParams.set('accountId', accountId);
  return url.toString();
}
