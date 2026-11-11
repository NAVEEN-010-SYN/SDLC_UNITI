import { HttpClient, HttpClientOptions } from '../http/HttpClient';
import { ProblemError, UpstreamProblem } from '../../errors/problem';
import type { VcoErrorBody } from './velocloudTypes';

export interface VeloCloudCredentials {
  username: string;
  password: string;
  /** Operator logins can act across enterprises; enterprise logins are bound to one. */
  loginType: 'operator' | 'enterprise';
}

/** Methods that only read state and can be retried safely. */
const READ_METHODS = /^(enterprise\/getEnterprise|edge\/getEdge|metrics\/|event\/get|configuration\/getConfiguration|link\/get)/;

/**
 * VCO portal API client. VCO authenticates with a session cookie ("velocloud.session")
 * issued by /login/*Login; we keep it in memory, share one in-flight login across
 * concurrent callers, and transparently re-login once if a call reports the session
 * expired (HTTP 401/403 or an RPC error code -32000 "session not valid").
 */
export class VeloCloudClient {
  private sessionCookie: string | null = null;
  private loginInFlight: Promise<string> | null = null;
  private readonly http: HttpClient;

  constructor(
    httpOptions: Omit<HttpClientOptions, 'vendor'>,
    private readonly credentials: VeloCloudCredentials,
  ) {
    this.http = new HttpClient({ ...httpOptions, vendor: 'VELOCLOUD' });
  }

  get hasSession(): boolean {
    return this.sessionCookie !== null;
  }

  async login(): Promise<string> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = (async () => {
      const path = this.credentials.loginType === 'operator' ? '/portal/rest/login/operatorLogin' : '/portal/rest/login/enterpriseLogin';
      const res = await this.http.request<unknown>({
        method: 'POST',
        path,
        body: { username: this.credentials.username, password: this.credentials.password },
        idempotent: true,
      });
      const setCookie = res.headers.get('set-cookie') ?? '';
      const match = /velocloud\.session=([^;]+)/.exec(setCookie);
      if (!match) throw new UpstreamProblem('VELOCLOUD', 'login succeeded but no session cookie was returned');
      this.sessionCookie = match[1];
      return this.sessionCookie;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async logout(): Promise<void> {
    if (!this.sessionCookie) return;
    try {
      await this.http.request({ method: 'POST', path: '/portal/rest/logout', body: {}, headers: this.cookieHeader() });
    } finally {
      this.sessionCookie = null;
    }
  }

  /** Invokes a portal API method, e.g. call('enterprise/getEnterpriseEdges', {...}). */
  async call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    if (!this.sessionCookie) await this.login();
    try {
      return await this.invoke<T>(method, params);
    } catch (err) {
      if (this.isSessionExpired(err)) {
        this.sessionCookie = null;
        await this.login();
        return this.invoke<T>(method, params);
      }
      throw err;
    }
  }

  private async invoke<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const res = await this.http.request<T & VcoErrorBody>({
      method: 'POST',
      path: `/portal/rest/${method}`,
      body: params,
      headers: this.cookieHeader(),
      idempotent: READ_METHODS.test(method),
    });
    const body = res.data as VcoErrorBody | undefined;
    if (body && typeof body === 'object' && !Array.isArray(body) && body.error) {
      throw new VcoRpcError(method, body.error.code, body.error.message);
    }
    return res.data as T;
  }

  private cookieHeader(): Record<string, string> {
    return this.sessionCookie ? { Cookie: `velocloud.session=${this.sessionCookie}` } : {};
  }

  private isSessionExpired(err: unknown): boolean {
    if (err instanceof VcoRpcError) return err.code === -32000 || /session/i.test(err.rpcMessage);
    if (err instanceof ProblemError) {
      const status = err.extensions.upstreamStatus;
      return status === 401 || status === 403;
    }
    return false;
  }
}

export class VcoRpcError extends UpstreamProblem {
  constructor(
    public readonly method: string,
    public readonly code: number,
    public readonly rpcMessage: string,
  ) {
    super('VELOCLOUD', `${method} failed with VCO error ${code}: ${rpcMessage}`, false);
  }
}
