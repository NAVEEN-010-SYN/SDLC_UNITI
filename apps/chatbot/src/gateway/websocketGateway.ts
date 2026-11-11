import { IncomingMessage, Server } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { HandoffPublisher } from '../conversation/conversationService';
import { Conversation, TranscriptEntry } from '../domain/types';
import { Logger } from '../logger';
import { GatewaySession, SessionDeps } from './gatewaySession';
import { ServerFrame } from './protocol';

/**
 * WebSocket gateway for the embeddable chat widget, mounted at /api/v1/ws.
 * - Rejects upgrades from origins not on the allow-list.
 * - Closes sockets that do not authenticate within AUTH_TIMEOUT_MS.
 * - Pings every HEARTBEAT_MS and terminates peers that miss a pong.
 * - Fans out live-agent messages to every socket subscribed to a conversation.
 */

export const WS_PATH = '/api/v1/ws';
const AUTH_TIMEOUT_MS = 10_000;
const HEARTBEAT_MS = 30_000;
const MAX_PAYLOAD_BYTES = 8 * 1024;

export interface GatewayOptions {
  allowedOrigins: string[];
  logger: Logger;
  sessionDeps: Omit<SessionDeps, 'onSubscribe'>;
}

interface Peer {
  socket: WebSocket;
  session: GatewaySession;
  alive: boolean;
}

export function isOriginAllowed(origin: string | undefined, allowed: string[]): boolean {
  if (!origin) return false;
  return allowed.some((entry) => {
    if (entry === origin) return true;
    // Support wildcard subdomains: https://*.uniti.example
    const wildcard = /^(https?:\/\/)\*\.(.+)$/.exec(entry);
    if (!wildcard) return false;
    try {
      const url = new URL(origin);
      return `${url.protocol}//` === wildcard[1] && url.hostname.endsWith(`.${wildcard[2]}`);
    } catch {
      return false;
    }
  });
}

export class WebSocketGateway implements HandoffPublisher {
  private wss?: WebSocketServer;
  private heartbeat?: NodeJS.Timeout;
  private readonly peers = new Set<Peer>();
  private readonly byConversation = new Map<string, Set<GatewaySession>>();

  constructor(private readonly options: GatewayOptions) {}

  attach(server: Server): void {
    this.wss = new WebSocketServer({
      server,
      path: WS_PATH,
      maxPayload: MAX_PAYLOAD_BYTES,
      verifyClient: (info: { origin: string; req: IncomingMessage }) => {
        const ok = isOriginAllowed(info.origin, this.options.allowedOrigins);
        if (!ok) this.options.logger.warn('ws upgrade rejected: origin', { origin: info.origin });
        return ok;
      },
    });
    this.wss.on('connection', (socket) => this.onConnection(socket));
    this.heartbeat = setInterval(() => this.sweep(), HEARTBEAT_MS);
    this.heartbeat.unref();
  }

  private onConnection(socket: WebSocket): void {
    const session = new GatewaySession(
      {
        ...this.options.sessionDeps,
        onSubscribe: (conversationId, s) => this.subscribe(conversationId, s),
      },
      (frame) => this.sendFrame(socket, frame),
    );
    const peer: Peer = { socket, session, alive: true };
    this.peers.add(peer);

    const authTimer = setTimeout(() => {
      if (!session.authenticated) socket.close(4401, 'authentication timeout');
    }, AUTH_TIMEOUT_MS);

    socket.on('pong', () => {
      peer.alive = true;
    });
    socket.on('message', (data, isBinary) => {
      if (isBinary) {
        socket.close(4400, 'binary frames not supported');
        return;
      }
      void session.receive(data.toString());
    });
    socket.on('close', () => {
      clearTimeout(authTimer);
      this.peers.delete(peer);
      for (const conversationId of session.subscriptions) this.unsubscribe(conversationId, session);
    });
    socket.on('error', (error) => this.options.logger.warn('ws socket error', { sessionId: session.id, error }));
  }

  private sendFrame(socket: WebSocket, frame: ServerFrame): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
  }

  private subscribe(conversationId: string, session: GatewaySession): void {
    const set = this.byConversation.get(conversationId) ?? new Set<GatewaySession>();
    set.add(session);
    this.byConversation.set(conversationId, set);
  }

  private unsubscribe(conversationId: string, session: GatewaySession): void {
    const set = this.byConversation.get(conversationId);
    if (!set) return;
    set.delete(session);
    if (set.size === 0) this.byConversation.delete(conversationId);
  }

  private sweep(): void {
    for (const peer of this.peers) {
      if (!peer.alive) {
        peer.socket.terminate();
        this.peers.delete(peer);
        continue;
      }
      peer.alive = false;
      peer.socket.ping();
    }
  }

  /** Pushes a live agent's message to the customer's open widget(s). */
  deliverAgentMessage(entry: TranscriptEntry): number {
    const sessions = this.byConversation.get(entry.conversationId);
    if (!sessions) return 0;
    for (const session of sessions) {
      session.deliver({ type: 'agent_message', conversationId: entry.conversationId, text: entry.text, at: entry.createdAt });
    }
    return sessions.size;
  }

  /** HandoffPublisher: informs connected widgets that an agent has been requested. */
  async publish(conversation: Conversation, transcript: string): Promise<void> {
    this.options.logger.info('handoff requested', {
      conversationId: conversation.id,
      queue: conversation.handoff?.queue,
      ticketId: conversation.handoff?.ticketId,
      transcriptLines: transcript.split('\n').length,
    });
  }

  get connectionCount(): number {
    return this.peers.size;
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    for (const peer of this.peers) peer.socket.close(1001, 'server shutting down');
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
  }
}
