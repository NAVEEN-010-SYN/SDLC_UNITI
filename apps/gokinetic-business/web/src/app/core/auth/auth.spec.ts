import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { Me } from '../models/api.models';
import { authGuard, permissionGuard, roleGuard } from './auth.guards';
import { AuthFlowError, AuthService, sanitiseReturnUrl } from './auth.service';
import { codeChallenge, decodeJwt } from './pkce';

function fakeJwt(claims: Record<string, unknown>): string {
  const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `${enc({ alg: 'none' })}.${enc(claims)}.sig`;
}

const nowSec = () => Math.floor(Date.now() / 1000);
const ME: Me = {
  userId: 'u1',
  email: 'admin@acme.example',
  roles: ['BUSINESS_ADMIN'],
  accountId: 'ACC-10000001',
  siteScope: null,
  permissions: ['users:manage', 'orders:read'],
  account: { id: 'ACC-10000001', name: 'Acme', status: 'ACTIVE', slaTier: 'ENHANCED', currency: 'GBP' }
};

describe('pkce helpers', () => {
  it('computes the RFC 7636 S256 challenge', async () => {
    // Test vector from RFC 7636 appendix B.
    expect(await codeChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk')).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('decodes JWT payloads and rejects malformed tokens', () => {
    expect(decodeJwt(fakeJwt({ sub: 'u1', exp: 10 }))?.sub).toBe('u1');
    expect(decodeJwt('not-a-jwt')).toBeNull();
    expect(decodeJwt(fakeJwt({ exp: 10 }))).toBeNull();
  });
});

describe('sanitiseReturnUrl', () => {
  it('only allows same-app relative paths', () => {
    expect(sanitiseReturnUrl('/orders/1?x=1')).toBe('/orders/1?x=1');
    expect(sanitiseReturnUrl('//evil.example')).toBe('/');
    expect(sanitiseReturnUrl('https://evil.example')).toBe('/');
    expect(sanitiseReturnUrl('/\\evil.example')).toBe('/');
    expect(sanitiseReturnUrl(null)).toBe('/');
  });
});

describe('AuthService', () => {
  let service: AuthService;
  let backend: HttpTestingController;

  beforeEach(() => {
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    backend = TestBed.inject(HttpTestingController);
  });

  afterEach(() => sessionStorage.clear());

  it('treats expired tokens as signed out', () => {
    sessionStorage.setItem('gkb.accessToken', fakeJwt({ sub: 'u1', exp: nowSec() + 10 }));
    service = TestBed.inject(AuthService);
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('rejects a callback whose state does not match', async () => {
    service = TestBed.inject(AuthService);
    sessionStorage.setItem('gkb.authFlow', JSON.stringify({ state: 'expected', verifier: 'v', returnUrl: '/' }));
    await expectAsync(service.completeLogin('code', 'forged')).toBeRejectedWithError(AuthFlowError);
    expect(sessionStorage.getItem('gkb.authFlow')).toBeNull();
  });

  it('redeems the code with the stored verifier and returns the saved URL', async () => {
    service = TestBed.inject(AuthService);
    sessionStorage.setItem('gkb.authFlow', JSON.stringify({ state: 's1', verifier: 'ver', returnUrl: '/orders' }));
    const pending = service.completeLogin('the-code', 's1');
    const req = backend.expectOne(environment.oidc.tokenEndpoint);
    expect(req.request.body).toContain('code_verifier=ver');
    expect(req.request.body).toContain('grant_type=authorization_code');
    req.flush({ access_token: fakeJwt({ sub: 'u1', exp: nowSec() + 3600, roles: ['BUSINESS_USER'] }), expires_in: 3600 });
    expect(await pending).toBe('/orders');
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.hasRole('BUSINESS_USER')).toBeTrue();
  });

  it('loads /me once and exposes server-derived permissions', async () => {
    sessionStorage.setItem('gkb.accessToken', fakeJwt({ sub: 'u1', exp: nowSec() + 3600 }));
    service = TestBed.inject(AuthService);
    const a = service.loadSession();
    const b = service.loadSession();
    backend.expectOne(`${environment.apiBaseUrl}/me`).flush(ME);
    expect(await a).toEqual(ME);
    expect(await b).toEqual(ME);
    expect(service.can('users:manage')).toBeTrue();
    expect(service.can('audit:read')).toBeFalse();
    expect(service.isAdmin()).toBeTrue();
  });
});

describe('route guards', () => {
  let auth: jasmine.SpyObj<AuthService>;
  const state = { url: '/billing' } as RouterStateSnapshot;
  const route = {} as ActivatedRouteSnapshot;
  const run = (guard: typeof authGuard) => TestBed.runInInjectionContext(() => guard(route, state)) as Promise<boolean | UrlTree>;

  beforeEach(() => {
    auth = jasmine.createSpyObj<AuthService>('AuthService', ['isAuthenticated', 'loadSession', 'hasRole', 'can']);
    auth.loadSession.and.resolveTo(ME);
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: auth }] });
  });

  it('sends anonymous users to login with a return URL', async () => {
    auth.isAuthenticated.and.returnValue(false);
    const result = (await run(authGuard)) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/login?returnUrl=%2Fbilling');
  });

  it('allows authenticated users with a session', async () => {
    auth.isAuthenticated.and.returnValue(true);
    expect(await run(authGuard)).toBeTrue();
  });

  it('redirects users without the role to /forbidden', async () => {
    auth.hasRole.and.returnValue(false);
    const result = (await run(roleGuard('BUSINESS_ADMIN'))) as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(result)).toBe('/forbidden');
    expect(auth.hasRole).toHaveBeenCalledWith('BUSINESS_ADMIN');
  });

  it('checks permissions after loading the session', async () => {
    auth.can.and.callFake((p) => p === 'billing:read');
    expect(await run(permissionGuard('billing:read'))).toBeTrue();
    expect(auth.loadSession).toHaveBeenCalled();
  });
});
