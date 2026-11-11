import { HttpClient, HttpClientOptions } from '../http/HttpClient';
import { UpstreamProblem } from '../../errors/problem';
import type { FgtProxyResponse, FmgResponse } from './fortinetTypes';

export interface FortiManagerCredentials {
  username: string;
  password: string;
}

type RpcMethod = 'get' | 'set' | 'add' | 'update' | 'delete' | 'exec' | 'replace';

/** FortiManager status codes that mean the session token is no longer valid. */
const SESSION_INVALID_CODES = new Set([-11, -20]);

/**
 * FortiManager JSON-RPC client. Login returns a session token that is passed in every
 * request body. Sessions expire after idle timeout; on a session-invalid code the
 * client logs in again once and replays the request. FortiGate REST endpoints are
 * reached through FortiManager's /sys/proxy/json, so devices never need to be directly
 * reachable from the portal.
 */
export class FortiManagerClient {
  private session: string | null = null;
  private loginInFlight: Promise<string> | null = null;
  private nextId = 1;
  private readonly http: HttpClient;

  constructor(
    httpOptions: Omit<HttpClientOptions, 'vendor'>,
    private readonly credentials: FortiManagerCredentials,
  ) {
    this.http = new HttpClient({ ...httpOptions, vendor: 'FORTINET' });
  }

  get hasSession(): boolean {
    return this.session !== null;
  }

  async login(): Promise<string> {
    if (this.loginInFlight) return this.loginInFlight;
    this.loginInFlight = (async () => {
      const res = await this.http.request<FmgResponse<unknown>>({
        method: 'POST',
        path: '/jsonrpc',
        idempotent: true,
        body: {
          id: this.nextId++,
          method: 'exec',
          params: [{ url: '/sys/login/user', data: { user: this.credentials.username, passwd: this.credentials.password } }],
        },
      });
      const status = res.data?.result?.[0]?.status;
      if (!status || status.code !== 0 || !res.data.session) {
        throw new UpstreamProblem('FORTINET', `FortiManager login failed: ${status?.message ?? 'no session returned'}`);
      }
      this.session = res.data.session;
      return this.session;
    })();
    try {
      return await this.loginInFlight;
    } finally {
      this.loginInFlight = null;
    }
  }

  async logout(): Promise<void> {
    if (!this.session) return;
    try {
      await this.rawRpc('exec', '/sys/logout', undefined);
    } finally {
      this.session = null;
    }
  }

  /** Performs one JSON-RPC call and returns `result[0].data`, throwing on a non-zero status. */
  async rpc<T>(method: RpcMethod, url: string, data?: unknown, extraParams: Record<string, unknown> = {}): Promise<T> {
    if (!this.session) await this.login();
    let res = await this.rawRpc<T>(method, url, data, extraParams);
    let status = res.result?.[0]?.status;
    if (status && SESSION_INVALID_CODES.has(status.code)) {
      this.session = null;
      await this.login();
      res = await this.rawRpc<T>(method, url, data, extraParams);
      status = res.result?.[0]?.status;
    }
    if (!status) throw new UpstreamProblem('FORTINET', `${method} ${url}: malformed JSON-RPC response`);
    if (status.code !== 0) {
      throw new UpstreamProblem('FORTINET', `${method} ${url} failed (${status.code}): ${status.message}`, false);
    }
    return res.result[0].data as T;
  }

  private async rawRpc<T>(method: RpcMethod, url: string, data: unknown, extraParams: Record<string, unknown> = {}): Promise<FmgResponse<T>> {
    const res = await this.http.request<FmgResponse<T>>({
      method: 'POST',
      path: '/jsonrpc',
      idempotent: method === 'get',
      body: {
        id: this.nextId++,
        method,
        params: [{ url, ...(data !== undefined ? { data } : {}), ...extraParams }],
        session: this.session,
      },
    });
    return res.data;
  }

  /**
   * Calls a FortiOS REST resource on a managed device through FortiManager. Returns the
   * device's `results` payload, or throws if FortiManager or the device reported an error.
   */
  async proxy<T>(adom: string, device: string, action: 'get' | 'post' | 'put', resource: string, payload?: unknown): Promise<T> {
    const target = `adom/${adom}/device/${device}`;
    const data = await this.rpc<Array<FgtProxyResponse<T>>>('exec', '/sys/proxy/json', {
      target: [target],
      action,
      resource,
      ...(payload !== undefined ? { payload } : {}),
    });
    const entry = data?.[0];
    if (!entry) throw new UpstreamProblem('FORTINET', `proxy ${resource} on ${device}: empty response`);
    if (entry.status.code !== 0) {
      throw new UpstreamProblem('FORTINET', `device ${device} unreachable via FortiManager: ${entry.status.message}`, true);
    }
    if (!entry.response || entry.response.status !== 'success') {
      throw new UpstreamProblem(
        'FORTINET',
        `device ${device} rejected ${action.toUpperCase()} ${resource} (HTTP ${entry.response?.http_status ?? '?'})`,
        false,
        entry.response?.http_status,
      );
    }
    return entry.response.results;
  }

  /**
   * Waits for a FortiManager task (install, upgrade) to finish. FortiManager reports
   * percent complete and a state; num_err > 0 means at least one device failed.
   */
  async waitForTask(taskId: number, opts: { timeoutMs: number; pollMs: number; sleep: (ms: number) => Promise<void> }): Promise<void> {
    const deadline = Date.now() + opts.timeoutMs;
    for (;;) {
      const task = await this.rpc<{ percent: number; num_err: number; state: number; title?: string }>('get', `/task/task/${taskId}`);
      if (task.percent >= 100) {
        if (task.num_err > 0) {
          const lines = await this.rpc<Array<{ name: string; detail: string }>>('get', `/task/task/${taskId}/line`).catch(() => []);
          const detail = lines.map((l) => `${l.name}: ${l.detail}`).join('; ');
          throw new UpstreamProblem('FORTINET', `FortiManager task ${taskId} finished with errors${detail ? `: ${detail}` : ''}`);
        }
        return;
      }
      if (Date.now() > deadline) throw new UpstreamProblem('FORTINET', `FortiManager task ${taskId} did not finish in time`, true);
      await opts.sleep(opts.pollMs);
    }
  }
}
