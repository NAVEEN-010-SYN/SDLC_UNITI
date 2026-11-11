import { promises as fs } from 'node:fs';
import { dirname } from 'node:path';

export interface SyncState {
  nextSyncToken: string;
  completedAt: string;
}

export interface TokenStore {
  load(): Promise<SyncState | null>;
  save(state: SyncState): Promise<void>;
}

/**
 * Persists the Sync API token on disk. Writes go to a temp file then
 * rename, so a crash mid-write never leaves a corrupt token (which would
 * force an expensive full resync).
 */
export class FileTokenStore implements TokenStore {
  constructor(private readonly path: string) {}

  async load(): Promise<SyncState | null> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.path, 'utf8')) as Partial<SyncState>;
      return typeof parsed.nextSyncToken === 'string' && parsed.nextSyncToken
        ? { nextSyncToken: parsed.nextSyncToken, completedAt: String(parsed.completedAt ?? '') }
        : null;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async save(state: SyncState): Promise<void> {
    await fs.mkdir(dirname(this.path), { recursive: true });
    const temp = `${this.path}.${process.pid}.tmp`;
    await fs.writeFile(temp, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temp, this.path);
  }
}
