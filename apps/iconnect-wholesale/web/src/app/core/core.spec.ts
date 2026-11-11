import { HttpClient, HttpErrorResponse, HttpHeaders, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Route, Router, UrlTree, provideRouter } from '@angular/router';
import { ApiProblem } from './api-problem';
import { AuthService } from './auth.service';
import { CORRELATION_HEADER, authInterceptor, correlationIdInterceptor, problemInterceptor } from './http.interceptors';
import { Roles, roleGuard } from './role.guard';
import { OrdersApi } from './wholesale-api';

function token(claims: Record<string, unknown>): string {
  const encode = (o: object) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${encode({ alg: 'none' })}.${encode(claims)}.sig`;
}

const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

describe('AuthService', () => {
  beforeEach(() => sessionStorage.clear());

  it('parses roles, partner and expiry from the access token', () => {
    const session = AuthService.parse(token({ sub: 'u1', name: 'Ana', roles: [Roles.WholesaleBuyer], partner_id: 'p-1', exp: 2000000000 }));
    expect(session.roles).toEqual([Roles.WholesaleBuyer]);
    expect(session.partnerId).toBe('p-1');
    expect(session.expiresAt).toBe(2000000000000);
  });

  it('withholds an expired token', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [], exp: 100 }));
    expect(auth.accessToken()).toBeNull();
  });

  it('checks roles against the session', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [Roles.SupportAgent], exp: inOneHour() }));
    expect(auth.hasAnyRole([Roles.WholesaleBuyer, Roles.SupportAgent])).toBeTrue();
    expect(auth.hasAnyRole([Roles.WholesaleBuyer])).toBeFalse();
  });
});

describe('HTTP interceptors', () => {
  let http: HttpClient;
  let backend: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([correlationIdInterceptor, authInterceptor, problemInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    backend = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => backend.verify());

  it('adds bearer token and correlation id to API calls only', () => {
    auth.setToken(token({ sub: 'u1', roles: [], exp: inOneHour() }));
    http.get('/api/v1/orders').subscribe();
    http.get('https://cdn.example.org/logo.svg').subscribe();

    const api = backend.expectOne('/api/v1/orders');
    expect(api.request.headers.get('Authorization')).toMatch(/^Bearer /);
    expect(api.request.headers.get(CORRELATION_HEADER)).toMatch(/^web-/);
    const external = backend.expectOne('https://cdn.example.org/logo.svg');
    expect(external.request.headers.has('Authorization')).toBeFalse();
    expect(external.request.headers.has(CORRELATION_HEADER)).toBeFalse();
    api.flush({});
    external.flush('');
  });

  it('turns problem+json into ApiProblem with field errors', (done) => {
    http.post('/api/v1/orders', {}).subscribe({
      error: (p: ApiProblem) => {
        expect(p instanceof ApiProblem).toBeTrue();
        expect(p.code).toBe('validation.failed');
        expect(p.fieldError('uprn')).toBe('UPRN must be 1 to 12 digits.');
        expect(p.correlationId).toBe('abc-12345678');
        done();
      },
    });
    backend.expectOne('/api/v1/orders').flush(
      { title: 'One or more fields are invalid', status: 400, code: 'validation.failed', errors: { uprn: ['UPRN must be 1 to 12 digits.'] }, correlationId: 'abc-12345678' },
      { status: 400, statusText: 'Bad Request' });
  });

  it('ends the session and routes to sign-in on 401', () => {
    const router = TestBed.inject(Router);
    const navigate = spyOn(router, 'navigate').and.resolveTo(true);
    auth.setToken(token({ sub: 'u1', roles: [], exp: inOneHour() }));

    http.get('/api/v1/sla/summary').subscribe({ error: () => undefined });
    backend.expectOne('/api/v1/sla/summary').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(auth.isAuthenticated()).toBeFalse();
    expect(navigate).toHaveBeenCalledWith(['/signed-out'], jasmine.any(Object));
  });

  it('maps network failures to a readable problem', () => {
    const problem = ApiProblem.from(new HttpErrorResponse({ status: 0, headers: new HttpHeaders() }));
    expect(problem.code).toBe('network.unreachable');
  });
});

describe('roleGuard', () => {
  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  const run = (route: Route) => TestBed.runInInjectionContext(() => roleGuard(route, []));

  it('starts login when signed out', () => {
    const login = spyOn(TestBed.inject(AuthService), 'login').and.resolveTo();
    expect(run({})).toBeFalse();
    expect(login).toHaveBeenCalled();
  });

  it('allows wholesale buyers and redirects other roles', () => {
    const auth = TestBed.inject(AuthService);
    auth.setToken(token({ sub: 'u1', roles: [Roles.WholesaleBuyer], exp: inOneHour() }));
    expect(run({})).toBeTrue();

    auth.setToken(token({ sub: 'u2', roles: ['CONSUMER'], exp: inOneHour() }));
    const result = run({});
    expect(result instanceof UrlTree).toBeTrue();
    expect(String(result)).toBe('/forbidden');
  });

  it('honours route-specific roles', () => {
    TestBed.inject(AuthService).setToken(token({ sub: 'u1', roles: [Roles.WholesaleBuyer], exp: inOneHour() }));
    expect(run({ data: { roles: [Roles.SupportAgent] } }) instanceof UrlTree).toBeTrue();
  });
});

describe('OrdersApi', () => {
  let api: OrdersApi;
  let backend: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(OrdersApi);
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => backend.verify());

  it('omits empty filters from the query string', () => {
    api.list({ status: 'ACTIVE', type: '', search: undefined, page: 2, pageSize: 25 }).subscribe();
    const req = backend.expectOne((r) => r.url === '/api/v1/orders');
    expect(req.request.params.keys().sort()).toEqual(['page', 'pageSize', 'status']);
    req.flush({ items: [], page: 2, pageSize: 25, total: 0 });
  });

  it('distinguishes a new order from an idempotent replay', () => {
    const outcomes: boolean[] = [];
    const request = { partnerReference: 'R1', orderType: 'PROVIDE' as const, uprn: '1', productCode: 'FTTP500', careLevel: null,
      existingServiceId: null, migrationAuthCode: null, requestedDate: '2030-01-01' };
    api.place(request).subscribe((r) => outcomes.push(r.created));
    backend.expectOne('/api/v1/orders').flush({ id: 'o1' }, { status: 201, statusText: 'Created' });
    api.place(request).subscribe((r) => outcomes.push(r.created));
    backend.expectOne('/api/v1/orders').flush({ id: 'o1' }, { status: 200, statusText: 'OK' });
    expect(outcomes).toEqual([true, false]);
  });
});
