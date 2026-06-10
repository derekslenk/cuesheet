import os from 'os';
import path from 'path';
import fs from 'fs';

describe('getDatabase concurrency pragmas', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('opens the connection in WAL mode with a busy timeout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-wal-'));
    process.env.FILE_DIRECTORY = dir;

    const { getDatabase } = await import('../database');
    const db = await getDatabase();

    const journal = await db.get<{ journal_mode: string }>('PRAGMA journal_mode');
    expect(journal?.journal_mode.toLowerCase()).toBe('wal');

    const timeout = await db.get<{ timeout: number }>('PRAGMA busy_timeout');
    expect(timeout?.timeout).toBeGreaterThanOrEqual(1);

    await db.close();
  });
});
