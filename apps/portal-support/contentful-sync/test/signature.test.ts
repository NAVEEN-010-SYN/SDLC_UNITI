import { canonicalRequest, IncomingWebhook, sign, verifyWebhook } from '../src/webhooks/signature';

const SECRET = 'test-webhook-secret-0123456789abcdef';
const NOW = 1_780_000_000_000;

function signedRequest(body: string, overrides: Partial<IncomingWebhook> = {}, timestamp = NOW): IncomingWebhook {
  const req: IncomingWebhook = {
    method: 'POST',
    path: '/webhooks/contentful',
    rawBody: body,
    headers: {
      'content-type': 'application/vnd.contentful.management.v1+json',
      'x-contentful-topic': 'ContentManagement.Entry.publish',
      'x-contentful-timestamp': String(timestamp),
      'x-contentful-signed-headers': 'x-contentful-timestamp,x-contentful-topic',
    },
    ...overrides,
  };
  req.headers['x-contentful-signature'] = sign(canonicalRequest(req, ['x-contentful-timestamp', 'x-contentful-topic']), SECRET);
  return req;
}

describe('verifyWebhook', () => {
  const body = JSON.stringify({ sys: { id: 'art1', type: 'Entry' } });

  it('accepts a correctly signed, fresh request', () => {
    expect(verifyWebhook(signedRequest(body), SECRET, 300, NOW)).toEqual({ ok: true });
  });

  it('builds the canonical form from method, path, signed headers and body', () => {
    const req = signedRequest('{}');
    expect(canonicalRequest(req, ['x-contentful-topic'])).toBe('POST\n/webhooks/contentful\nx-contentful-topic:ContentManagement.Entry.publish\n{}');
  });

  it('rejects a tampered body', () => {
    const req = signedRequest(body);
    req.rawBody = body.replace('art1', 'art2');
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects a tampered signed header', () => {
    const req = signedRequest(body);
    req.headers['x-contentful-topic'] = 'ContentManagement.Entry.delete';
    expect(verifyWebhook(req, SECRET, 300, NOW).ok).toBe(false);
  });

  it('rejects the wrong secret and malformed signatures without throwing', () => {
    expect(verifyWebhook(signedRequest(body), 'another-secret', 300, NOW).ok).toBe(false);
    const req = signedRequest(body);
    req.headers['x-contentful-signature'] = 'not-hex';
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'signature mismatch' });
  });

  it('rejects replays outside the tolerance window', () => {
    const old = signedRequest(body, {}, NOW - 301_000);
    expect(verifyWebhook(old, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'timestamp outside tolerance' });
  });

  it('requires the timestamp to be covered by the signature', () => {
    const req = signedRequest(body);
    req.headers['x-contentful-signed-headers'] = 'x-contentful-topic';
    req.headers['x-contentful-signature'] = sign(canonicalRequest(req, ['x-contentful-topic']), SECRET);
    expect(verifyWebhook(req, SECRET, 300, NOW)).toEqual({ ok: false, reason: 'timestamp not covered by signature' });
  });

  it('rejects requests with missing headers', () => {
    expect(verifyWebhook({ method: 'POST', path: '/', headers: {}, rawBody: '' }, SECRET, 300, NOW)).toEqual({
      ok: false,
      reason: 'missing signature headers',
    });
  });
});
