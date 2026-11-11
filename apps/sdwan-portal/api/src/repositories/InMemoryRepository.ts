import type { Page } from '../domain/types';

export interface PageRequest {
  page: number;
  pageSize: number;
}

export interface Repository<T extends { id: string }> {
  get(id: string): Promise<T | undefined>;
  insert(item: T): Promise<T>;
  /**
   * Optimistic update: `expectedUpdatedAt` must match the stored value (when the entity
   * carries `updatedAt`), otherwise the update is rejected so two approvers acting at
   * once cannot overwrite each other.
   */
  update(item: T, expectedUpdatedAt?: string): Promise<T>;
  delete(id: string): Promise<boolean>;
  find(predicate: (item: T) => boolean, sort?: (a: T, b: T) => number): Promise<T[]>;
  page(predicate: (item: T) => boolean, req: PageRequest, sort?: (a: T, b: T) => number): Promise<Page<T>>;
}

export class ConcurrentModificationError extends Error {
  constructor(id: string) {
    super(`entity ${id} was modified by another request`);
  }
}

export function paginate<T>(items: T[], req: PageRequest): Page<T> {
  const start = (req.page - 1) * req.pageSize;
  return { items: items.slice(start, start + req.pageSize), page: req.page, pageSize: req.pageSize, total: items.length };
}

/**
 * Map-backed repository. Values are deep-cloned on the way in and out so callers can
 * never mutate stored state without going through update(). A database-backed
 * implementation only needs to satisfy the Repository interface.
 */
export class InMemoryRepository<T extends { id: string }> implements Repository<T> {
  protected readonly items = new Map<string, T>();

  async get(id: string): Promise<T | undefined> {
    const v = this.items.get(id);
    return v ? structuredClone(v) : undefined;
  }

  async insert(item: T): Promise<T> {
    if (this.items.has(item.id)) throw new Error(`duplicate id ${item.id}`);
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async update(item: T, expectedUpdatedAt?: string): Promise<T> {
    const current = this.items.get(item.id) as (T & { updatedAt?: string }) | undefined;
    if (!current) throw new Error(`entity ${item.id} does not exist`);
    if (expectedUpdatedAt !== undefined && current.updatedAt !== expectedUpdatedAt) {
      throw new ConcurrentModificationError(item.id);
    }
    this.items.set(item.id, structuredClone(item));
    return structuredClone(item);
  }

  async delete(id: string): Promise<boolean> {
    return this.items.delete(id);
  }

  async find(predicate: (item: T) => boolean, sort?: (a: T, b: T) => number): Promise<T[]> {
    const out = [...this.items.values()].filter(predicate).map((v) => structuredClone(v));
    return sort ? out.sort(sort) : out;
  }

  async page(predicate: (item: T) => boolean, req: PageRequest, sort?: (a: T, b: T) => number): Promise<Page<T>> {
    return paginate(await this.find(predicate, sort), req);
  }
}
