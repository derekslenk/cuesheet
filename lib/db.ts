import { getDatabase } from './database';

type Db = Awaited<ReturnType<typeof getDatabase>>;

/**
 * Execute a callback with the shared database singleton.
 * The singleton lifecycle is managed by lib/database.ts — do not close the db
 * inside the callback; the connection persists for the lifetime of the process.
 *
 * Scripts under scripts/*.ts use direct sqlite.open calls for startup-only
 * operations and are intentionally out of scope for Phase 0.1.
 */
export async function withDb<T>(callback: (db: Db) => Promise<T>): Promise<T> {
  const db = await getDatabase();
  return callback(db);
}
