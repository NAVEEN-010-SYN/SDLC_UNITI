import { inject } from '@angular/core';
import { CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const Roles = {
  WholesaleBuyer: 'WHOLESALE_BUYER',
  SupportAgent: 'SUPPORT_AGENT',
} as const;

export const PORTAL_ROLES = [Roles.WholesaleBuyer, Roles.SupportAgent];

/**
 * Lazy routes only match for signed-in users holding one of the route's roles
 * (route data `roles`, default: any portal role). This is a UX gate; the API enforces authorisation.
 */
export const roleGuard: CanMatchFn = (route, segments) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    const returnUrl = '/' + segments.map((s) => s.path).join('/');
    void auth.login(returnUrl);
    return false;
  }
  const roles = (route.data?.['roles'] as string[] | undefined) ?? PORTAL_ROLES;
  return auth.hasAnyRole(roles) ? true : router.createUrlTree(['/forbidden']);
};
