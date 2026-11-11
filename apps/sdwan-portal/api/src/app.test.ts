import request from 'supertest';
import { createApp } from './app';
import { signDevToken } from './auth/jwt';
import { ACCOUNT, createHarness, HA_EDGE, Harness, OTHER_ACCOUNT } from './testing/harness';

describe('HTTP API', () => {
  let h: Harness;
  let app: ReturnType<typeof createApp>;
  const base = `/api/v1/accounts/${ACCOUNT}`;
  const as = (role: 'BUSINESS_USER' | 'BUSINESS_ADMIN' | 'PARTNER_AGENT', userId = `u-${role.toLowerCase()}`) =>
    `Bearer ${h.token(userId, role)}`;

  beforeEach(() => {
    h = createHarness();
    app = createApp(h.c);
  });

  it('returns RFC 7807 problems and echoes the correlation id', async () => {
    const res = await request(app).get(`${base}/edges`).set('X-Correlation-Id', 'trace-abcdef12');
    expect(res.status).toBe(401);
    expect(res.headers['content-type']).toMatch(/application\/problem\+json/);
    expect(res.headers['x-correlation-id']).toBe('trace-abcdef12');
    expect(res.body).toMatchObject({ type: expect.stringMatching(/\/unauthorized$/), status: 401, correlationId: 'trace-abcdef12' });
  });

  it('scopes business users to their own account and validates the account id', async () => {
    expect((await request(app).get(`/api/v1/accounts/${OTHER_ACCOUNT}/edges`).set('Authorization', as('BUSINESS_USER'))).status).toBe(403);
    const bad = await request(app).get('/api/v1/accounts/not-an-account/edges').set('Authorization', as('BUSINESS_USER'));
    expect(bad.status).toBe(400);
    expect(bad.body.errors[0].message).toMatch(/ACC-/);
  });

  it('paginates and filters edges across both vendors', async () => {
    const all = await request(app).get(`${base}/edges?pageSize=2`).set('Authorization', as('BUSINESS_USER'));
    expect(all.status).toBe(200);
    expect(all.body).toMatchObject({ page: 1, pageSize: 2, total: 6 });
    expect(all.body.items).toHaveLength(2);

    const forti = await request(app).get(`${base}/edges?vendor=FORTINET`).set('Authorization', as('BUSINESS_USER'));
    expect(forti.body.items.every((e: { vendor: string }) => e.vendor === 'FORTINET')).toBe(true);
    expect((await request(app).get(`${base}/edges?status=SIDEWAYS`).set('Authorization', as('BUSINESS_USER'))).status).toBe(400);
  });

  it('serves edge health with series and a 404 problem for unknown edges', async () => {
    const res = await request(app)
      .get(`${base}/edges/${HA_EDGE}/health?from=2026-03-02T08:00:00Z&to=2026-03-02T10:00:00Z`)
      .set('Authorization', as('BUSINESS_USER'));
    expect(res.status).toBe(200);
    expect(res.body.links).toHaveLength(2);
    expect(res.body.links[0].series.length).toBeGreaterThan(0);
    expect((await request(app).get(`${base}/edges/nope/health`).set('Authorization', as('BUSINESS_USER'))).status).toBe(404);
  });

  it('lets users raise change requests but only admins approve them', async () => {
    const created = await request(app)
      .post(`${base}/change-requests`)
      .set('Authorization', as('BUSINESS_USER'))
      .send({ title: 'Reboot head office edge', edgeIds: [HA_EDGE], payload: { type: 'EDGE_REBOOT' }, submit: true });
    expect(created.status).toBe(201);
    expect(created.headers.location).toBe(`${base}/change-requests/${created.body.id}`);

    const decision = { decision: 'APPROVE' };
    const byUser = await request(app).post(`${base}/change-requests/${created.body.id}/decisions`).set('Authorization', as('BUSINESS_USER', 'u-peer')).send(decision);
    expect(byUser.status).toBe(403);
    const byAdmin = await request(app).post(`${base}/change-requests/${created.body.id}/decisions`).set('Authorization', as('BUSINESS_ADMIN')).send(decision);
    expect(byAdmin.status).toBe(200);
    expect(byAdmin.body.status).toBe('APPROVED');

    const list = await request(app).get(`${base}/change-requests?status=APPROVED`).set('Authorization', as('BUSINESS_USER'));
    expect(list.body.total).toBe(1);
  });

  it('restricts partner agents to read-only operational views', async () => {
    expect((await request(app).get(`/api/v1/accounts/${ACCOUNT}/alerts`).set('Authorization', `Bearer ${partnerToken(h)}`)).status).toBe(200);
    expect((await request(app).get(`${base}/edges/${HA_EDGE}/policies`).set('Authorization', `Bearer ${partnerToken(h)}`)).status).toBe(403);
  });

  it('exports the SLA report as CSV and rejects malformed JSON', async () => {
    const csv = await request(app).get(`${base}/reports/sla?period=2026-03&format=csv`).set('Authorization', as('BUSINESS_USER'));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.split('\r\n')[0]).toMatch(/^siteName,edgeName,vendor/);

    const bad = await request(app).post(`${base}/change-requests`).set('Authorization', as('BUSINESS_USER')).set('Content-Type', 'application/json').send('{"title":');
    expect(bad.status).toBe(400);
    expect(bad.body.type).toMatch(/malformed-json$/);
  });
});

function partnerToken(h: Harness): string {
  return signDevToken({ userId: 'p-agent', roles: ['PARTNER_AGENT'], partnerAccountIds: [ACCOUNT] }, h.c.jwt);
}
