import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '../auth/auth.service';
import { ApiProblem, toApiProblem } from './api-problem';
import { CORRELATION_HEADER, authInterceptor, correlationIdInterceptor, problemInterceptor } from './interceptors';

describe('toApiProblem', () => {
  it('parses RFC 7807 bodies including field errors and extensions', () => {
    const problem = toApiProblem(
      new HttpErrorResponse({
        status: 422,
        error: {
          type: 'https://errors.uniti.example/gokinetic-business/business-rule/last-admin',
          title: 'Business rule violated',
          status: 422,
          detail: 'The account must keep at least one active business admin',
          correlationId: 'corr-1234567',
          rule: 'last-admin',
          errors: [{ field: 'body.role', message: 'bad' }]
        }
      })
    );
    expect(problem).toEqual(jasmine.any(ApiProblem));
    expect(problem.code).toBe('business-rule/last-admin');
    expect(problem.isRule('last-admin')).toBeTrue();
    expect(problem.correlationId).toBe('corr-1234567');
    expect(problem.fieldErrors).toEqual([{ field: 'body.role', message: 'bad' }]);
    expect(problem.extensions['rule']).toBe('last-admin');
  });

  it('describes network failures', () => {
    const problem = toApiProblem(new HttpErrorResponse({ status: 0 }));
    expect(problem.code).toBe('network');
    expect(problem.detail).toContain('could not be reached');
  });

  it('falls back for non-problem bodies, keeping the header correlation id', () => {
    const problem = toApiProblem(
      new HttpErrorResponse({ status: 502, statusText: 'Bad Gateway', error: '<html>', headers: new HttpHeaders({ [CORRELATION_HEADER]: 'hdr-123456' }) })
    );
    expect(problem.title).toBe('Bad Gateway');
    expect(problem.correlationId).toBe('hdr-123456');
  });
});

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: jasmine.SpyObj<AuthService>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['accessToken', 'handleSessionExpired']);
    auth.accessToken.and.returnValue('token-abc');
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
        provideHttpClientTesting()
      ]
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('adds bearer token and a correlation id to API calls', () => {
    http.get('/api/v1/me').subscribe();
    const req = backend.expectOne('/api/v1/me');
    expect(req.request.headers.get('Authorization')).toBe('Bearer token-abc');
    expect(req.request.headers.get(CORRELATION_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    req.flush({});
  });

  it('never leaks the token to other hosts', () => {
    http.post('https://id.example-uniti.net/token', 'x').subscribe();
    const req = backend.expectOne('https://id.example-uniti.net/token');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    expect(req.request.headers.has(CORRELATION_HEADER)).toBeFalse();
    req.flush({});
  });

  it('keeps a caller-supplied correlation id', () => {
    http.get('/api/v1/orders', { headers: { [CORRELATION_HEADER]: 'fixed-id-0001' } }).subscribe();
    const req = backend.expectOne('/api/v1/orders');
    expect(req.request.headers.get(CORRELATION_HEADER)).toBe('fixed-id-0001');
    req.flush({});
  });

  it('maps errors to ApiProblem and expires the session on 401', () => {
    let error: unknown;
    http.get('/api/v1/orders').subscribe({ error: (e) => (error = e) });
    backend
      .expectOne('/api/v1/orders')
      .flush({ type: 'x', title: 'Unauthorized', status: 401, detail: 'Access token has expired' }, { status: 401, statusText: 'Unauthorized' });
    expect(error).toEqual(jasmine.any(ApiProblem));
    expect((error as ApiProblem).detail).toBe('Access token has expired');
    expect(auth.handleSessionExpired).toHaveBeenCalled();
  });

  it('does not expire the session for 403s', () => {
    http.get('/api/v1/users').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/users').flush({ title: 'Forbidden', status: 403 }, { status: 403, statusText: 'Forbidden' });
    expect(auth.handleSessionExpired).not.toHaveBeenCalled();
  });
});
