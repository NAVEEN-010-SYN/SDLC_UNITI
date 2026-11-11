import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../environments/environment';
import { ApiProblem } from './api-problem';
import { AuthService } from './auth.service';

export const CORRELATION_HEADER = 'X-Correlation-Id';

const isApiCall = (url: string) => url.startsWith(environment.apiBaseUrl);

/** Attaches the bearer token to API calls only, so it never leaks to third-party hosts. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const token = inject(AuthService).accessToken();
  if (!token || !isApiCall(req.url)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }));
};

/** Gives every API call its own correlation id so support can trace a UI action through the logs. */
export const correlationIdInterceptor: HttpInterceptorFn = (req, next) => {
  if (!isApiCall(req.url) || req.headers.has(CORRELATION_HEADER)) {
    return next(req);
  }
  return next(req.clone({ setHeaders: { [CORRELATION_HEADER]: `web-${crypto.randomUUID()}` } }));
};

/** Converts API failures into {@link ApiProblem}; an expired session sends the user back through login. */
export const problemInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse) || !isApiCall(req.url)) {
        return throwError(() => error);
      }
      if (error.status === 401) {
        auth.logout();
        void router.navigate(['/signed-out'], { queryParams: { returnUrl: router.url } });
      }
      return throwError(() => ApiProblem.from(error));
    }),
  );
};
