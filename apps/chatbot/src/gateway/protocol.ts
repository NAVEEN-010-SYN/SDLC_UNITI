import { BotReply } from '../domain/types';
import { ConversationView } from '../conversation/conversationService';

/**
 * Web chat widget WebSocket protocol (JSON text frames).
 * The bearer token is sent in the first frame rather than the URL so it never
 * appears in proxy/access logs.
 */

export type ClientFrame =
  | { type: 'auth'; token: string }
  | { type: 'start' }
  | { type: 'resume'; conversationId: string }
  | { type: 'message'; conversationId: string; text: string; clientMessageId: string }
  | { type: 'end'; conversationId: string }
  | { type: 'ping' };

export type ServerFrame =
  | { type: 'ready'; userId: string }
  | { type: 'conversation'; conversation: ConversationView; replies: BotReply[] }
  | { type: 'reply'; conversationId: string; inReplyTo: string; replies: BotReply[]; conversation: ConversationView }
  | { type: 'agent_message'; conversationId: string; text: string; at: string }
  | { type: 'ended'; conversationId: string }
  | { type: 'error'; code: string; message: string; inReplyTo?: string; retryAfterSeconds?: number }
  | { type: 'pong' };

export class FrameError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function requireString(frame: Record<string, unknown>, key: string, max = 256): string {
  const value = frame[key];
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new FrameError('bad_frame', `"${key}" must be a non-empty string of at most ${max} characters`);
  }
  return value;
}

/** Parses and validates an inbound frame; throws FrameError on anything malformed. */
export function parseClientFrame(raw: string): ClientFrame {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new FrameError('bad_json', 'Frame is not valid JSON');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new FrameError('bad_frame', 'Frame must be a JSON object');
  const frame = data as Record<string, unknown>;
  switch (frame.type) {
    case 'auth':
      return { type: 'auth', token: requireString(frame, 'token', 8192) };
    case 'start':
      return { type: 'start' };
    case 'resume':
      return { type: 'resume', conversationId: requireString(frame, 'conversationId', 64) };
    case 'message':
      return {
        type: 'message',
        conversationId: requireString(frame, 'conversationId', 64),
        text: requireString(frame, 'text', 2000),
        clientMessageId: requireString(frame, 'clientMessageId', 64),
      };
    case 'end':
      return { type: 'end', conversationId: requireString(frame, 'conversationId', 64) };
    case 'ping':
      return { type: 'ping' };
    default:
      throw new FrameError('unknown_type', `Unknown frame type "${String(frame.type)}"`);
  }
}
