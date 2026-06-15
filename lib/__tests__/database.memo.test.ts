import os from 'os';
import path from 'path';
import fs from 'fs';

// Wrap the real sqlite.open so we can count how many connections are opened.
// (This test is RED against the pre-fix check-then-await getDatabase, which
// opened once per concurrent first-hit; GREEN with promise memoization.)
jest.mock('sqlite', () => {
  const actual = jest.requireActual('sqlite');
  return { ...actual, open: jest.fn(actual.open) };
});

describe('getDatabase connection memoization', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('opens a single connection across concurrent first-hits', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-memo-'));
    process.env.FILE_DIRECTORY = dir;

    // Acquire the (mocked) sqlite module and the freshly-imported database
    // module after the reset so both reference the same module instance.
    const sqlite = await import('sqlite');
    const { getDatabase } = await import('../database');

    const [a, b, c] = await Promise.all([getDatabase(), getDatabase(), getDatabase()]);

    expect(sqlite.open as jest.Mock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(b).toBe(c);

    await a.close();
  });
});
