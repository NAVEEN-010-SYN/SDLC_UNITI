import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPool } from './query';
import { logger } from '../lib/logger';

/**
 * Applies forward-only SQL migrations in lexical order, recording each in schema_migrations.
 * Each migration runs in its own transaction; an advisory lock prevents concurrent runners.
 */
async function migrate(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  const pool = createPool(url, 1, 60_000);
  const client = await pool.connect();
  const dir = join(__dirname, 'migrations');
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())'
    );
    const applied = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name)
    );
    const files = readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    for (const file of files) {
      if (applied.has(file)) continue;
      const sql = readFileSync(join(dir, file), 'utf8');
      logger.info('applying migration', { file });
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
    logger.info('migrations complete', { total: files.length });
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => undefined);
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  logger.error('migration failed', { err });
  process.exit(1);
});
