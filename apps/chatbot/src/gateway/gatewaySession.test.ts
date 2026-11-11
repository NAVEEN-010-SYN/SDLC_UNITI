import { createApplication } from '../app';
import { silentLogger } from '../logger';
import { RecordingAnalytics } from '../testing/chatHarness';
import { fakeClients, OPEN_HOURS_CLOCK, signToken, testConfig } from '../testing/fakes';
import { GatewaySession } from './gatewaySession';
import { ServerFrame } from './protocol';

function setup(maxMessages = 30) {
  const config = testConfig({ rateLimit: { windowMs: 60_000, maxMessages } });
  const application = createApplication(config, silentLogger, { clients: fakeClients(), analytics: new RecordingAnalytics(), clock: OPEN_HOURS_CLOCK });
  const frames: ServerFrame[] = [];
  const subscriptions: string[] = [];
  const session = new GatewaySession(
    {
      service: application.service,
      auth: config.auth,
      limiter: application.limiter,
      logger: silentLogger,
      onSubscribe: (conversationId) => subscriptions.push(conversationId),
    },
    (frame) => frames.push(frame),
  );
  const send = (frame: object) => session.receive(JSON.stringify(frame));
  return { session, frames, subscriptions, send, limiter: application.limiter };
}

async function authenticatedConversation(maxMessages?: number) {
  const ctx = setup(maxMessages);
  await ctx.send({ type: 'auth', token: signToken() });
  await ctx.send({ type: 'start' });
  const started = ctx.frames.find((f) => f.type === 'conversation') as Extract<ServerFrame, { type: 'conversation' }>;
  return { ...ctx, conversationId: started.conversation.id };
}

describe('GatewaySession', () => {
  it('answers pings before authentication but nothing else', async () => {
    const { send, frames } = setup();
    await send({ type: 'ping' });
    await send({ type: 'start' });
    expect(frames).toEqual([{ type: 'pong' }, { type: 'error', code: 'unauthenticated', message: 'Send an auth frame first' }]);
  });

  it('reports malformed frames without dropping the connection state', async () => {
    const { session, frames } = setup();
    await session.receive('{not json');
    await session.receive(JSON.stringify({ type: 'message', conversationId: 'c1' }));
    await session.receive(JSON.stringify({ type: 'teleport' }));
    expect(frames.map((f) => (f.type === 'error' ? f.code : f.type))).toEqual(['bad_json', 'bad_frame', 'unknown_type']);
  });

  it('rejects an invalid token and stays unauthenticated', async () => {
    const { send, frames, session } = setup();
    await send({ type: 'auth', token: 'not-a-jwt' });
    expect(frames[0]).toMatchObject({ type: 'error', code: 'unauthorized' });
    expect(session.authenticated).toBe(false);
  });

  it('starts a conversation, subscribes to it and routes messages through the dialog engine', async () => {
    const { send, frames, subscriptions, conversationId } = await authenticatedConversation();
    expect(frames[0]).toEqual({ type: 'ready', userId: 'user-1' });
    expect(subscriptions).toEqual([conversationId]);

    await send({ type: 'message', conversationId, text: 'my bill', clientMessageId: 'm-1' });
    const reply = frames[frames.length - 1];
    expect(reply).toMatchObject({ type: 'reply', inReplyTo: 'm-1', conversation: { activeFlow: 'bill_enquiry' } });
    expect(subscriptions).toEqual([conversationId]);
  });

  it('processes frames strictly in arrival order', async () => {
    const { session, frames, conversationId } = await authenticatedConversation();
    const ids = ['a', 'b', 'c'];
    await Promise.all(ids.map((id) => session.receive(JSON.stringify({ type: 'message', conversationId, text: 'hello', clientMessageId: id }))));
    const replies = frames.filter((f): f is Extract<ServerFrame, { type: 'reply' }> => f.type === 'reply');
    expect(replies.map((r) => r.inReplyTo)).toEqual(ids);
  });

  it('applies the shared per-user rate limit and tells the widget when to retry', async () => {
    const { send, frames, conversationId } = await authenticatedConversation(2);
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-1' });
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-2' });
    expect(frames[frames.length - 1]).toEqual({
      type: 'error',
      code: 'rate_limited',
      message: 'Too many messages. Try again in 60s.',
      inReplyTo: 'm-2',
      retryAfterSeconds: 60,
    });
  });

  it('shares its budget with the REST transport so switching transport does not bypass limits', async () => {
    const { send, frames, conversationId, limiter } = await authenticatedConversation(2);
    // The conversation start used one hit; simulate one REST message by the same user.
    expect(limiter.hit('user:user-1').allowed).toBe(true);
    await send({ type: 'message', conversationId, text: 'hello', clientMessageId: 'm-1' });
    expect(frames[frames.length - 1]).toMatchObject({ type: 'error', code: 'rate_limited' });
  });

  it('maps service errors to safe error frames', async () => {
    const { send, frames } = await authenticatedConversation();
    await send({ type: 'resume', conversationId: '00000000-0000-4000-8000-00000000dead' });
    expect(frames[frames.length - 1]).toMatchObject({ type: 'error', code: 'not-found' });
  });

  it('unsubscribes when the conversation is ended', async () => {
    const { send, frames, session, conversationId } = await authenticatedConversation();
    await send({ type: 'end', conversationId });
    expect(frames[frames.length - 1]).toEqual({ type: 'ended', conversationId });
    expect(session.subscriptions.has(conversationId)).toBe(false);
  });
});
