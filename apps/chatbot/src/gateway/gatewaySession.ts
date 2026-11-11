import { randomUUID } from 'crypto';
import { AuthConfig } from '../config';
import { ConversationService } from '../conversation/conversationService';
import { AppError } from '../domain/errors';
import { Principal } from '../domain/types';
import { verifyToken } from '../http/middleware';
import { Logger } from '../logger';
import { RateLimiter } from '../ratelimit/rateLimiter';
import { ClientFrame, FrameError, parseClientFrame, ServerFrame } from './protocol';

/**
 * Transport-independent state machine for one widget connection:
 * UNAUTHENTICATED --auth--> READY. Every frame after auth is routed to the
 * ConversationService. Kept separate from the `ws` socket so it can be unit
 * tested without network I/O.
 */

export interface SessionDeps {
  service: ConversationService;
  auth: AuthConfig;
  limiter: RateLimiter;
  logger: Logger;
  /** Called when the session starts or resumes a conversation (for agent fan-out). */
  onSubscribe(conversationId: string, session: GatewaySession): void;
}

export class GatewaySession {
  readonly id = randomUUID();
  private principal?: Principal;
  private token?: string;
  private readonly conversations = new Set<string>();
  /** Serialises frame handling so replies are delivered in order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly deps: SessionDeps,
    private readonly send: (frame: ServerFrame) => void,
  ) {}

  get authenticated(): boolean {
    return this.principal !== undefined;
  }

  get subscriptions(): ReadonlySet<string> {
    return this.conversations;
  }

  receive(raw: string): Promise<void> {
    this.queue = this.queue.then(() => this.process(raw)).catch((error) => {
      this.deps.logger.error('gateway frame processing crashed', { sessionId: this.id, error });
    });
    return this.queue;
  }

  deliver(frame: ServerFrame): void {
    this.send(frame);
  }

  private async process(raw: string): Promise<void> {
    let frame: ClientFrame;
    try {
      frame = parseClientFrame(raw);
    } catch (error) {
      const fe = error as FrameError;
      this.send({ type: 'error', code: fe.code ?? 'bad_frame', message: fe.message });
      return;
    }

    if (frame.type === 'ping') {
      this.send({ type: 'pong' });
      return;
    }

    if (frame.type === 'auth') {
      this.authenticate(frame.token);
      return;
    }

    if (!this.principal) {
      this.send({ type: 'error', code: 'unauthenticated', message: 'Send an auth frame first' });
      return;
    }

    const inReplyTo = frame.type === 'message' ? frame.clientMessageId : undefined;
    try {
      await this.dispatch(frame, this.principal);
    } catch (error) {
      this.send(this.errorFrame(error, inReplyTo));
    }
  }

  private authenticate(token: string): void {
    try {
      this.principal = verifyToken(token, this.deps.auth);
      this.token = token;
      this.send({ type: 'ready', userId: this.principal.userId });
    } catch (error) {
      this.principal = undefined;
      this.send(this.errorFrame(error));
    }
  }

  private async dispatch(frame: Exclude<ClientFrame, { type: 'auth' } | { type: 'ping' }>, principal: Principal): Promise<void> {
    switch (frame.type) {
      case 'start': {
        this.enforceRateLimit(principal);
        const result = await this.deps.service.start(principal, 'WEB_WIDGET');
        this.subscribe(result.conversation.id);
        this.send({ type: 'conversation', conversation: result.conversation, replies: result.replies });
        return;
      }
      case 'resume': {
        const conversation = await this.deps.service.get(frame.conversationId, principal);
        this.subscribe(conversation.id);
        this.send({ type: 'conversation', conversation, replies: [] });
        return;
      }
      case 'message': {
        this.enforceRateLimit(principal);
        const result = await this.deps.service.handleMessage(frame.conversationId, principal, frame.text, {
          correlationId: `ws-${this.id}-${frame.clientMessageId}`.slice(0, 128),
          bearerToken: this.token,
        });
        this.subscribe(frame.conversationId);
        this.send({
          type: 'reply',
          conversationId: frame.conversationId,
          inReplyTo: frame.clientMessageId,
          replies: result.replies,
          conversation: result.conversation,
        });
        return;
      }
      case 'end': {
        await this.deps.service.end(frame.conversationId, principal);
        this.conversations.delete(frame.conversationId);
        this.send({ type: 'ended', conversationId: frame.conversationId });
        return;
      }
    }
  }

  private enforceRateLimit(principal: Principal): void {
    const decision = this.deps.limiter.hit(`user:${principal.userId}`);
    if (!decision.allowed) {
      throw new FrameError('rate_limited', `Too many messages. Try again in ${decision.retryAfterSeconds}s.`, decision.retryAfterSeconds);
    }
  }

  private subscribe(conversationId: string): void {
    if (this.conversations.has(conversationId)) return;
    this.conversations.add(conversationId);
    this.deps.onSubscribe(conversationId, this);
  }

  private errorFrame(error: unknown, inReplyTo?: string): ServerFrame {
    if (error instanceof FrameError) {
      return { type: 'error', code: error.code, message: error.message, inReplyTo, retryAfterSeconds: error.retryAfterSeconds };
    }
    if (error instanceof AppError) {
      if (error.status >= 500) this.deps.logger.warn('gateway request failed', { sessionId: this.id, error });
      return { type: 'error', code: error.code, message: error.status >= 500 ? 'Something went wrong. Please try again.' : error.message, inReplyTo };
    }
    this.deps.logger.error('gateway unexpected error', { sessionId: this.id, error });
    return { type: 'error', code: 'internal', message: 'Something went wrong. Please try again.', inReplyTo };
  }
}
