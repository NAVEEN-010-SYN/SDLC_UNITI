import { randomUUID } from 'crypto';
import { MessageAuthor, Page, TranscriptEntry } from '../domain/types';
import { redactText } from '../privacy/piiRedactor';

/**
 * Conversation transcript storage. Text is always redacted on write, so no
 * repository implementation can ever hold raw PII. Retention is enforced by
 * `purgeOlderThan`, scheduled by the server.
 */

export interface NewTranscriptEntry {
  conversationId: string;
  author: MessageAuthor;
  text: string;
  intent?: TranscriptEntry['intent'];
  confidence?: number;
}

export interface TranscriptRepository {
  append(entry: NewTranscriptEntry): Promise<TranscriptEntry>;
  list(conversationId: string, page: number, pageSize: number): Promise<Page<TranscriptEntry>>;
  recent(conversationId: string, limit: number): Promise<TranscriptEntry[]>;
  purgeOlderThan(cutoffIso: string): Promise<number>;
}

export class InMemoryTranscriptRepository implements TranscriptRepository {
  private readonly entries = new Map<string, TranscriptEntry[]>();

  constructor(
    private readonly clock: () => Date = () => new Date(),
    private readonly idFactory: () => string = randomUUID,
  ) {}

  async append(entry: NewTranscriptEntry): Promise<TranscriptEntry> {
    const stored: TranscriptEntry = {
      id: this.idFactory(),
      conversationId: entry.conversationId,
      author: entry.author,
      text: redactText(entry.text),
      intent: entry.intent,
      confidence: entry.confidence !== undefined ? Math.round(entry.confidence * 1000) / 1000 : undefined,
      createdAt: this.clock().toISOString(),
    };
    const list = this.entries.get(entry.conversationId) ?? [];
    list.push(stored);
    this.entries.set(entry.conversationId, list);
    return stored;
  }

  async list(conversationId: string, page: number, pageSize: number): Promise<Page<TranscriptEntry>> {
    const all = this.entries.get(conversationId) ?? [];
    const start = (page - 1) * pageSize;
    return { items: all.slice(start, start + pageSize), page, pageSize, total: all.length };
  }

  async recent(conversationId: string, limit: number): Promise<TranscriptEntry[]> {
    const all = this.entries.get(conversationId) ?? [];
    return all.slice(Math.max(0, all.length - limit));
  }

  async purgeOlderThan(cutoffIso: string): Promise<number> {
    let removed = 0;
    for (const [conversationId, list] of this.entries) {
      const kept = list.filter((e) => e.createdAt >= cutoffIso);
      removed += list.length - kept.length;
      if (kept.length === 0) this.entries.delete(conversationId);
      else this.entries.set(conversationId, kept);
    }
    return removed;
  }
}

/** Renders a transcript as plain text for agent handoff context. */
export function renderTranscript(entries: TranscriptEntry[]): string {
  return entries
    .map((e) => {
      const time = e.createdAt.slice(11, 16);
      const who = e.author === 'USER' ? 'Customer' : e.author === 'BOT' ? 'Bot' : e.author === 'AGENT' ? 'Agent' : 'System';
      return `[${time}] ${who}: ${e.text}`;
    })
    .join('\n');
}
