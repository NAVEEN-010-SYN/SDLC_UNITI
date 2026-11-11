import { Pool, PoolClient, QueryResultRow } from 'pg';
import { logger } from '../lib/logger';
import { ConflictError } from '../lib/errors';

/**
 * Thin query layer over node-postgres. Repositories depend on the `Db` interface
 * so they can run inside or outside a transaction and be replaced by fakes in tests.
 */
export interface Db {
  many<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]>;
  oneOrNone<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null>;
  one<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T>;
  exec(sql: string, params?: unknown[]): Promise<number>;
  tx<T>(fn: (db: Db) => Promise<T>): Promise<T>;
}

type Queryable = Pool | PoolClient;

const PG_UNIQUE_VIOLATION = '23505';
const PG_SERIALIZATION_FAILURE = '40001';
const SLOW_QUERY_MS = 250;

function translatePgError(err: unknown): never {
  const pgErr = err as { code?: string; constraint?: string; detail?: string };
  if (pgErr?.code === PG_UNIQUE_VIOLATION) {
    throw new ConflictError('A record with the same unique value already exists', {
      constraint: pgErr.constraint
    });
  }
  throw err;
}

class PgDb implements Db {
  constructor(private readonly q: Queryable, private readonly pool: Pool, private readonly inTx: boolean) {}

  private async run<T extends QueryResultRow>(sql: string, params: unknown[] = []) {
    const started = Date.now();
    try {
      const result = await this.q.query<T>(sql, params);
      const elapsed = Date.now() - started;
      if (elapsed > SLOW_QUERY_MS) {
        logger.warn('slow query', { elapsedMs: elapsed, sql: sql.slice(0, 200) });
      }
      return result;
    } catch (err) {
      translatePgError(err);
    }
  }

  async many<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T[]> {
    return (await this.run<T>(sql, params)).rows;
  }

  async oneOrNone<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T | null> {
    const rows = (await this.run<T>(sql, params)).rows;
    if (rows.length > 1) throw new Error(`Expected at most one row, got ${rows.length}`);
    return rows[0] ?? null;
  }

  async one<T extends QueryResultRow>(sql: string, params?: unknown[]): Promise<T> {
    const row = await this.oneOrNone<T>(sql, params);
    if (!row) throw new Error('Expected exactly one row, got none');
    return row;
  }

  async exec(sql: string, params?: unknown[]): Promise<number> {
    return (await this.run(sql, params)).rowCount ?? 0;
  }

  async tx<T>(fn: (db: Db) => Promise<T>): Promise<T> {
    if (this.inTx) return fn(this);
    const maxAttempts = 3;
    for (let attempt = 1; ; attempt++) {
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(new PgDb(client, this.pool, true));
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => undefined);
        const code = (err as { code?: string }).code;
        if (code === PG_SERIALIZATION_FAILURE && attempt < maxAttempts) {
          logger.warn('retrying transaction after serialization failure', { attempt });
          continue;
        }
        throw err;
      } finally {
        client.release();
      }
    }
  }
}

export function createPool(url: string, max: number, statementTimeoutMs: number): Pool {
  const pool = new Pool({ connectionString: url, max, statement_timeout: statementTimeoutMs });
  pool.on('error', (err) => logger.error('idle postgres client error', { err }));
  return pool;
}

export function createDb(pool: Pool): Db {
  return new PgDb(pool, pool, false);
}

/** Builds a parameterised WHERE clause from optional filters. */
export class WhereBuilder {
  private readonly clauses: string[] = [];
  readonly params: unknown[] = [];

  add(sqlWithPlaceholder: string, value: unknown): this {
    if (value === undefined || value === null || value === '') return this;
    this.params.push(value);
    this.clauses.push(sqlWithPlaceholder.replace(/\?/g, `$${this.params.length}`));
    return this;
  }

  addRaw(sql: string): this {
    this.clauses.push(sql);
    return this;
  }

  nextParam(value: unknown): string {
    this.params.push(value);
    return `$${this.params.length}`;
  }

  toSql(): string {
    return this.clauses.length ? `WHERE ${this.clauses.join(' AND ')}` : '';
  }
}
