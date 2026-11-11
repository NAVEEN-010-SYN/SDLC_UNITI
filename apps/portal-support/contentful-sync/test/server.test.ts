import request from 'supertest';
import { createApp } from '../src/server';
import { SyncService } from '../src/sync/syncService';
import { canonicalRequest, sign } from '../src/webhooks/signature';
import { silentLogger } from './fixtures';

const SECRET = 'server-test-secret-abcdef0123456789';
const SIGNED = ['x-contentful-timestamp', 'x-contentful-topic'];

function headersFor(body: string, topic: string, timestamp = Date.now()): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/vnd.contentful.management.v1+json',
    'x-contentful-topic': topic,
    'x-contentful-timestamp': String(timestamp),
    'x-contentful-signed-headers': SIGNED.join(','),
  };
  headers['x-contentful-signature'] = sign(
    canonicalRequest({ method: 'POST', path: '/webhooks/contentful', headers, rawBody: body }, SIGNED),
    SECRET,
  );
  return headers;
}

describe('webhook endpoint', () => {
  const trigger = jest.fn().mockResolvedValue({});
  const app = createApp({
    sync: { trigger } as unknown as SyncService,
    webhook: { secret: SECRET, maxAgeSeconds: 300 },
    logger: silentLogger(),
  });
  const body = JSON.stringify({ sys: { id: 'art1', type: 'Entry' } });

  beforeEach(() => trigger.mockClear());

  it('accepts a signed publish event and triggers a sync', async () => {
    const res = await request(app).post('/webhooks/contentful').set(headersFor(body, 'ContentManagement.Entry.publish')).send(body);

    expect(res.status).toBe(202);
    expect(res.headers['x-correlation-id']).toBeDefined();
    expect(trigger).toHaveBeenCalledTimes(1);
  });

  it('acknowledges irrelevant topics without syncing', async () => {
    const res = await request(app).post('/webhooks/contentful').set(headersFor(body, 'ContentManagement.Entry.save')).send(body);

    expect(res.status).toBe(204);
    expect(trigger).not.toHaveBeenCalled();
  });

  it('rejects bad signatures with an RFC 7807 problem and echoes the correlation id', async () => {
    const headers = { ...headersFor(body, 'ContentManagement.Entry.publish'), 'x-correlation-id': 'corr-abc-12345' };
    const res = await request(app).post('/webhooks/contentful').set(headers).send(body.replace('art1', 'art9'));

    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toContain('application/problem+json');
    expect(res.body).toMatchObject({ status: 401, title: 'Unauthorized', correlationId: 'corr-abc-12345' });
    expect(trigger).not.toHaveBeenCalled();
  });

  it('returns problem+json for unknown routes', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.instance).toBe('/nope');
  });
});
