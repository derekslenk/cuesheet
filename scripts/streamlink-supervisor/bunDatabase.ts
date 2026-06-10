/**
 * Shared read-WRITE bun:sqlite handle for the supervisor, adapted to MinimalDb.
 *
 * BUN-ONLY (imports bun:sqlite); excluded from tsc + Jest. Imported by BOTH
 * compiled entrypoints — scripts/streamlink-supervisor/index.bun.ts and
 * src/cli/commands/supervisor.bun.ts — so they cannot drift. The supervisor now
 * owns the durable `disabled` write, so the handle is read-write; WAL +
 * busy_timeout let it share sources.db with the web app's sqlite3 handle.
 * WAL requires a LOCAL filesystem for FILE_DIRECTORY.
 */
import path from 'node:path';
import { Database as BunDatabase } from 'bun:sqlite';
import type { MinimalDb } from './streamSpecsLoader';

export function openBunDatabase(fileDirectory: string): MinimalDb {
  const dbPath = path.join(path.resolve(fileDirectory), 'sources.db');
  const sqlite = new BunDatabase(dbPath); // read-write (bun:sqlite default)
  sqlite.exec('PRAGMA journal_mode = WAL');
  sqlite.exec('PRAGMA busy_timeout = 5000');
  sqlite.exec('PRAGMA wal_autocheckpoint = 1000');
  return {
    async all<T = unknown>(sql: string, ...params: unknown[]): Promise<T[]> {
      return sqlite.query(sql).all(...params) as T[];
    },
    async run(sql: string, ...params: unknown[]): Promise<void> {
      sqlite.run(sql, ...params);
    },
  };
}
