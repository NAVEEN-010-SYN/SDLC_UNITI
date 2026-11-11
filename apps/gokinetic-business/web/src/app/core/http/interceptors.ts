import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';
import { toApiProblem } from './api-problem';

export const CORRELATION_HEADER = 'X-Correlation-Id';

/** Only our own API receives the bearer token and correlation id; never third-party hosts. */
export function isApiRequest(url: string): boolean {
  return url.startsWith(environment.apiBaseUrl) || url.startsWith(`${location.origin}${environment.apiBaseUrl}`);
}

export function newCorrelationId(): string {
  return crypto.randomUUID();
}

export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiRequest(req.url) || req.headers.has(CORRELATION_HEADER)) return next(req);
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: newCorrelationId() } }));
};

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).accessToken();
  if (!token || !isApiRequest(req.url)) return next(req);
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/**
 * Maps failures to ApiProblem. A 401 from the API means the session is no longer valid, so the
 * user is sent back through sign-in, returning to the page they were on.
 */
export const problemInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse)) return throwError(() => err);
      const problem = toApiProblem(err);
      if (problem.status === 401 && isApiRequest(req.url)) auth.handleSessionExpired();
      return throwError(() => problem);
    })
  );
};
