import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApplication } from '../app';
import { AppConfig } from '../config';
import { silentLogger } from '../logger';
import { RecordingAnalytics } from '../testing/chatHarness';
import { fakeClients, OPEN_HOURS_CLOCK, signToken, testConfig } from '../testing/fakes';

function build(overrides: Partial<AppConfig> = {}) {
  const analytics = new RecordingAnalytics();
  const agentMessages: string[] = [];
  const application = createApplication(testConfig(overrides), silentLogger, {
    clients: fakeClients(),
    analytics,
    clock: OPEN_HOURS_CLOCK,
    onAgentMessage: (entry) => agentMessages.push(entry.text),
  });
  return { ...application, analytics, agentMessages };
}

const consumer = `Bearer ${signToken()}`;
const otherUser = `Bearer ${signToken({ sub: 'user-2' })}`;
const agent = `Bearer ${signToken({ sub: 'agent-1', roles: ['SUPPORT_AGENT'] })}`;

async function startConversation(app: ReturnType<typeof build>['app'], auth = consumer): Promise<string> {
  const res = await request(app).post('/api/v1/conversations').set('Authorization', auth).send({ channel: 'WEB_WIDGET' }).expect(201);
  return res.body.conversation.id as string;
}

describe('chatbot REST API', () => {
  it('serves liveness and readiness without authentication', async () => {
    const { app } = build();
    await request(app).get('/api/v1/health/live').expect(200, { status: 'UP' });
    const ready = await request(app).get('/api/v1/health/ready').expect(200);
    expect(ready.body.checks).toEqual([{ name: 'conversation-store', up: true }]);
  });

  it('rejects missing and forged tokens with RFC 7807 problem details and a correlation id', async () => {
    const { app } = build();
    const missing = await request(app).get('/api/v1/conversations').expect(401);
    expect(missing.headers['content-type']).toContain('application/problem+json');
    const problem = JSON.parse(missing.text);
    expect(problem).toMatchObject({ type: 'https://errors.uniti.example/chatbot/unauthorized', status: 401, instance: '/api/v1/conversations' });
    expect(problem.correlationId).toBe(missing.headers['x-correlation-id']);

    const forged = jwt.sign({ sub: 'user-1', account_id: 'ACC-12345678', roles: ['SUPPORT_AGENT'] }, 'attacker-secret', {
      algorithm: 'HS256',
      issuer: 'https://issuer.test',
      audience: 'uniti-chatbot',
    });
    await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${forged}`).expect(401);
    await request(app).get('/api/v1/conversations').set('Authorization', `Bearer ${signToken({ roles: ['ADMIN'] })}`).expect(401);
  });

  it('propagates a well-formed inbound correlation id and replaces an unsafe one', async () => {
    const { app } = build();
    const kept = await request(app).get('/api/v1/health/live').set('X-Correlation-Id', 'portal-req-0001');
    expect(kept.headers['x-correlation-id']).toBe('portal-req-0001');
    const replaced = await request(app).get('/api/v1/health/live').set('X-Correlation-Id', 'bad id <script>');
    expect(replaced.headers['x-correlation-id']).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('runs a full conversation and returns a paginated, redacted transcript', async () => {
    const { app, analytics } = build();
    const start = await request(app).post('/api/v1/conversations').set('Authorization', consumer).send({}).expect(201);
    const id = start.body.conversation.id;
    expect(start.headers.location).toBe(`/api/v1/conversations/${id}`);
    expect(start.body.replies[0].text).toContain('Hi, Jane!');

    const reply = await request(app)
      .post(`/api/v1/conversations/${id}/messages`)
      .set('Authorization', consumer)
      .send({ text: 'is there an outage at SW1A 1AA? email me on jane@example.com' })
      .expect(200);
    expect(reply.body).toMatchObject({ intent: 'CHECK_OUTAGE', conversation: { activeFlow: 'check_outage', awaiting: 'faultOffer' } });
    expect(reply.body.conversation.slots).toBeUndefined();

    const transcript = await request(app).get(`/api/v1/conversations/${id}/transcript?page=1&pageSize=2`).set('Authorization', consumer).expect(200);
    expect(transcript.body).toMatchObject({ page: 1, pageSize: 2, total: 4 });
    expect(transcript.body.items[1]).toMatchObject({
      author: 'USER',
      text: 'is there an outage at [UK_POSTCODE]? email me on [EMAIL]',
      intent: 'CHECK_OUTAGE',
    });
    expect(analytics.names()).toEqual(['conversation_started', 'intent_classified', 'flow_started']);
  });

  it('validates message bodies and pagination at the boundary', async () => {
    const { app } = build();
    const id = await startConversation(app);
    const empty = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: '   ' }).expect(400);
    expect(JSON.parse(empty.text).errors).toEqual([{ field: 'text', message: 'must not be empty' }]);

    await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'x'.repeat(1001) }).expect(400);
    await request(app).post(`/api/v1/conversations/not-a-uuid/messages`).set('Authorization', consumer).send({ text: 'hi' }).expect(400);
    await request(app).post('/api/v1/conversations').set('Authorization', consumer).send({ channel: 'SMS' }).expect(400);

    const paging = await request(app).get(`/api/v1/conversations/${id}/transcript?pageSize=500`).set('Authorization', consumer).expect(400);
    expect(JSON.parse(paging.text).errors[0].field).toBe('pageSize');
  });

  it('answers malformed JSON with a 400 problem instead of a 500', async () => {
    const { app } = build();
    const res = await request(app)
      .post('/api/v1/conversations')
      .set('Authorization', consumer)
      .set('Content-Type', 'application/json')
      .send('{"channel":')
      .expect(400);
    expect(JSON.parse(res.text).type).toMatch(/malformed-json$/);
  });

  it("hides other users' conversations behind a 404 but lets support agents read them", async () => {
    const { app } = build();
    const id = await startConversation(app);
    await request(app).get(`/api/v1/conversations/${id}`).set('Authorization', otherUser).expect(404);
    await request(app).get(`/api/v1/conversations/${id}`).set('Authorization', agent).expect(200);
  });

  it('rate limits messages per user with standard headers and Retry-After', async () => {
    const { app } = build({ rateLimit: { windowMs: 60_000, maxMessages: 2 } });
    const id = await startConversation(app);
    const ok = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(200);
    expect(ok.headers['ratelimit-remaining']).toBe('0');

    const limited = await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(429);
    expect(limited.headers['retry-after']).toBe('60');
    expect(JSON.parse(limited.text)).toMatchObject({ status: 429, type: expect.stringMatching(/rate-limited$/) });

    // A different user has an independent budget.
    await request(app).post('/api/v1/conversations').set('Authorization', otherUser).send({}).expect(201);
  });

  it('only lets support agents post into handed-off conversations', async () => {
    const { app, agentMessages } = build();
    const id = await startConversation(app);
    await request(app).post(`/api/v1/conversations/${id}/agent-messages`).set('Authorization', consumer).send({ text: 'hi' }).expect(403);
    await request(app).post(`/api/v1/conversations/${id}/agent-messages`).set('Authorization', agent).send({ text: 'hi' }).expect(409);

    const send = (text: string) => request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text });
    await send('talk to an agent').expect(200);
    const handed = await send('Need help moving my service to a new house').expect(200);
    expect(handed.body.conversation).toMatchObject({ status: 'HANDED_OFF', handoff: { queue: 'consumer-support', ticketId: 'TKT-0000001' } });

    const posted = await request(app)
      .post(`/api/v1/conversations/${id}/agent-messages`)
      .set('Authorization', agent)
      .send({ text: 'Hi Jane, I can help - is your new address SW1A 2AA?' })
      .expect(201);
    expect(posted.body.text).toBe('Hi Jane, I can help - is your new address [UK_POSTCODE]?');
    expect(agentMessages).toEqual([posted.body.text]);
  });

  it('refuses messages after the conversation has ended', async () => {
    const { app } = build();
    const id = await startConversation(app);
    const ended = await request(app).delete(`/api/v1/conversations/${id}`).set('Authorization', consumer).expect(200);
    expect(ended.body.status).toBe('ENDED');
    await request(app).post(`/api/v1/conversations/${id}/messages`).set('Authorization', consumer).send({ text: 'hello' }).expect(409);
  });

  it('returns a problem document for unknown routes', async () => {
    const { app } = build();
    const res = await request(app).get('/nope').expect(404);
    expect(JSON.parse(res.text)).toMatchObject({ title: 'Route not found', detail: 'GET /nope does not exist' });
  });
});
