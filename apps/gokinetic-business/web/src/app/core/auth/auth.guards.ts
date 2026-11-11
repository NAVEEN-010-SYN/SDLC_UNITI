import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Permission, Role } from '../models/api.models';
import { AuthService } from './auth.service';

/** Requires a valid session; otherwise starts sign-in, returning to the requested URL. */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }
  const me = await auth.loadSession();
  return me ? true : router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * Restricts a route to the given roles. This only shapes navigation; the API enforces the
 * same rules server-side on every request.
 */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return async () => {
    // inject() must run before the first await: the injection context does not survive it.
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.loadSession();
    return auth.hasRole(...roles) ? true : router.createUrlTree(['/forbidden']);
  };
}

export function permissionGuard(permission: Permission): CanActivateFn {
  return async () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    await auth.loadSession();
    return auth.can(permission) ? true : router.createUrlTree(['/forbidden']);
  };
}
