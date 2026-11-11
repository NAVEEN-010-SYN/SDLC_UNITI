import { APIRequestContext, APIResponse, request } from '@playwright/test';
import { randomUUID } from 'crypto';
import { env } from '@config/env';

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  correlationId?: string;
  errors?: Array<{ field: string; message: string }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails | undefined,
    readonly correlationId: string,
  ) {
    super(`API call failed with ${status}: ${problem?.title ?? 'no problem body'} [correlationId=${correlationId}]`);
  }
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

let cachedToken: CachedToken | undefined;

/**
 * Fetches a client-credentials token used for test-data seeding. Tokens are
 * cached per worker process and refreshed 60s before expiry.
 */
export async function serviceToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) {
    return cachedToken.value;
  }
  const ctx = await request.newContext();
  try {
    const response = await ctx.post(env.oidc.tokenUrl(), {
      form: {
        grant_type: 'client_credentials',
        client_id: env.oidc.clientId(),
        client_secret: env.oidc.clientSecret(),
        scope: env.oidc.scope,
      },
    });
    if (!response.ok()) {
      throw new Error(`Token endpoint returned ${response.status()}`);
    }
    const body = (await response.json()) as { access_token: string; expires_in: number };
    cachedToken = { value: body.access_token, expiresAt: Date.now() + body.expires_in * 1000 };
    return cachedToken.value;
  } finally {
    await ctx.dispose();
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  correlationId?: string;
  expectedStatus?: number | number[];
}

/**
 * Thin typed wrapper over Playwright's APIRequestContext that adds bearer auth,
 * X-Correlation-Id propagation and RFC 7807 error decoding.
 */
export class ApiClient {
  private constructor(private readonly ctx: APIRequestContext) {}

  static async create(baseURL: string = env.urls.api, bearer?: string): Promise<ApiClient> {
    const token = bearer ?? (await serviceToken());
    const ctx = await request.newContext({
      baseURL,
      extraHTTPHeaders: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });
    return new ApiClient(ctx);
  }

  async get<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('GET', path, options);
  }

  async post<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('POST', path, options);
  }

  async patch<T>(path: string, options: RequestOptions = {}): Promise<T> {
    return this.send<T>('PATCH', path, options);
  }

  async delete(path: string, options: RequestOptions = {}): Promise<void> {
    await this.send<void>('DELETE', path, options);
  }

  async raw(method: string, path: string, options: RequestOptions = {}): Promise<APIResponse> {
    const correlationId = options.correlationId ?? randomUUID();
    return this.ctx.fetch(path, {
      method,
      params: compactQuery(options.query),
      data: options.body,
      headers: { 'X-Correlation-Id': correlationId },
    });
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private async send<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    const correlationId = options.correlationId ?? randomUUID();
    const response = await this.raw(method, path, { ...options, correlationId });
    const expected = options.expectedStatus === undefined ? undefined : [options.expectedStatus].flat();
    const accepted = expected ? expected.includes(response.status()) : response.ok();
    if (!accepted) {
      throw new ApiError(response.status(), await readProblem(response), correlationId);
    }
    if (response.status() === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }
}

function compactQuery(query: RequestOptions['query']): Record<string, string | number | boolean> | undefined {
  if (!query) {
    return undefined;
  }
  const result: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}

async function readProblem(response: APIResponse): Promise<ProblemDetails | undefined> {
  const contentType = response.headers()['content-type'] ?? '';
  if (!contentType.includes('json')) {
    return undefined;
  }
  try {
    return (await response.json()) as ProblemDetails;
  } catch {
    return undefined;
  }
}
