import { Conversation } from '../domain/types';

/**
 * Conversation (session) persistence. The in-memory implementation enforces an
 * idle TTL and optimistic concurrency via a version counter so two concurrent
 * messages on the same conversation cannot silently overwrite each other's
 * dialog state. A Redis implementation can satisfy the same interface.
 */

export interface StoredConversation {
  conversation: Conversation;
  version: number;
  expiresAt: number;
}

export interface ConversationRepository {
  get(id: string): Promise<StoredConversation | undefined>;
  create(conversation: Conversation): Promise<StoredConversation>;
  /** Saves if `expectedVersion` matches; returns false on a concurrent write. */
  save(conversation: Conversation, expectedVersion: number): Promise<boolean>;
  listByUser(userId: string): Promise<Conversation[]>;
  purgeExpired(): Promise<number>;
}

export class InMemoryConversationRepository implements ConversationRepository {
  private readonly items = new Map<string, StoredConversation>();

  constructor(
    private readonly ttlSeconds: number,
    private readonly now: () => number = Date.now,
  ) {}

  async get(id: string): Promise<StoredConversation | undefined> {
    const stored = this.items.get(id);
    if (!stored) return undefined;
    if (stored.expiresAt <= this.now()) {
      this.items.delete(id);
      return undefined;
    }
    return { conversation: structuredClone(stored.conversation), version: stored.version, expiresAt: stored.expiresAt };
  }

  async create(conversation: Conversation): Promise<StoredConversation> {
    if (this.items.has(conversation.id)) throw new Error(`Conversation ${conversation.id} already exists`);
    const stored = { conversation: structuredClone(conversation), version: 1, expiresAt: this.expiry() };
    this.items.set(conversation.id, stored);
    return { ...stored, conversation: structuredClone(conversation) };
  }

  async save(conversation: Conversation, expectedVersion: number): Promise<boolean> {
    const existing = this.items.get(conversation.id);
    if (!existing || existing.version !== expectedVersion) return false;
    this.items.set(conversation.id, {
      conversation: structuredClone(conversation),
      version: expectedVersion + 1,
      expiresAt: this.expiry(),
    });
    return true;
  }

  async listByUser(userId: string): Promise<Conversation[]> {
    const now = this.now();
    return [...this.items.values()]
      .filter((s) => s.expiresAt > now && s.conversation.principal.userId === userId)
      .map((s) => structuredClone(s.conversation))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async purgeExpired(): Promise<number> {
    const now = this.now();
    let removed = 0;
    for (const [id, stored] of this.items) {
      if (stored.expiresAt <= now) {
        this.items.delete(id);
        removed += 1;
      }
    }
    return removed;
  }

  private expiry(): number {
    return this.now() + this.ttlSeconds * 1000;
  }
}
