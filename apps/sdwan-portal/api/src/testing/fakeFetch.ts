import type { FetchLike } from '../providers/http/HttpClient';

export interface FakeReply {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedCall {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Scripted fetch for vendor client tests: replies are consumed in order and every request
 * is recorded. Responses are plain objects (not undici Responses) so headers such as
 * Set-Cookie are not filtered.
 */
export function fakeFetch(replies: FakeReply[]): { fetch: FetchLike; calls: RecordedCall[] } {
  const queue = [...replies];
  const calls: RecordedCall[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({
      url,
      method: String(init.method),
      headers: { ...(init.headers as Record<string, string>) },
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    });
    const reply = queue.shift();
    if (!reply) throw new Error(`unexpected request to ${url}`);
    const status = reply.status ?? 200;
    const text = reply.body === undefined ? '' : JSON.stringify(reply.body);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(reply.headers ?? {}),
      text: async () => text,
    } as unknown as Response;
  };
  return { fetch, calls };
}

export const noSleep = async (): Promise<void> => undefined;
