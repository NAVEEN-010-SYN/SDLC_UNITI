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

export function canonicalRequest(req: IncomingWebhook, signedHeaders: string[]): string {
  const headerPart = signedHeaders
    .map((name) => {
      const value = req.headers[name];
      return `${name}:${Array.isArray(value) ? value.join(',') : (value ?? '').trim()}`;
    })
    .join(';');
  return [req.method.toUpperCase(), encodeURI(req.path), headerPart, req.rawBody].join('\n');
}

export function sign(canonical: string, secret: string): string {
  return createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
}

export function verifyWebhook(req: IncomingWebhook, secret: string, maxAgeSeconds: number, nowMs: number = Date.now()): VerificationResult {
  const header = (name: string): string | undefined => {
    const value = req.headers[name];
    return Array.isArray(value) ? value[0] : value;
  };

  const signature = header('x-contentful-signature');
  const timestamp = header('x-contentful-timestamp');
  const signedHeaderList = header('x-contentful-signed-headers');
  if (!signature || !timestamp || !signedHeaderList) return { ok: false, reason: 'missing signature headers' };

  const sentAt = Number(timestamp);
  if (!Number.isFinite(sentAt) || Math.abs(nowMs - sentAt) > maxAgeSeconds * 1000) {
    return { ok: false, reason: 'timestamp outside tolerance' };
  }

  const signedHeaders = signedHeaderList.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
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
