import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Contentful webhook request verification.
 *
 * Contentful signs a canonical representation of the request with
 * HMAC-SHA256 and sends:
 *   x-contentful-signature       hex digest
 *   x-contentful-timestamp       ms since epoch
 *   x-contentful-signed-headers  comma-separated, lower-case header names
 *
 * canonical = METHOD \n path?query \n name:value;name:value \n raw body
 */
export interface IncomingWebhook {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
}

export type VerificationResult = { ok: true } | { ok: false; reason: string };

/** Header value as signed: arrays joined with ",", strings trimmed. */
function canonicalHeaderValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(',');
  return (value ?? '').trim();
}

export function canonicalRequest(req: IncomingWebhook, signedHeaders: string[]): string {
  const parts: string[] = [];
  for (const name of signedHeaders) parts.push(`${name}:${canonicalHeaderValue(req.headers[name])}`);
  return [req.method.toUpperCase(), encodeURI(req.path), parts.join(';'), req.rawBody].join('\n');
}

/** First value of a request header. */
function firstHeader(req: IncomingWebhook, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Split "a, B ,c" into ["a", "b", "c"], dropping empty names. */
function parseSignedHeaders(list: string): string[] {
  const names: string[] = [];
  for (const part of list.split(',')) {
    const name = part.trim().toLowerCase();
    if (name) names.push(name);
  }
  return names;
}

export function sign(canonical: string, secret: string): string {
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function verifyWebhook(req: IncomingWebhook, secret: string, maxAgeSeconds: number, nowMs: number = Date.now()): VerificationResult {
  const signature = firstHeader(req, 'x-contentful-signature');
  const timestamp = firstHeader(req, 'x-contentful-timestamp');
  const signedHeaderList = firstHeader(req, 'x-contentful-signed-headers');
  if (!signature || !timestamp || !signedHeaderList) return { ok: false, reason: 'missing signature headers' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowMs - sentAt) > maxAgeSeconds * 1000) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const signedHeaders = parseSignedHeaders(signedHeaderList);
  if (!signedHeaders.includes('x-contentful-timestamp')) {
    return { ok: false, reason: 'timestamp not covered by signature' };
  }

  const expected = Buffer.from(sign(canonicalRequest(req, signedHeaders), secret), 'hex');
  const provided = Buffer.from(signature, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, reason: 'signature mismatch' };
  }
  return { ok: true };
}
