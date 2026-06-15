/**
 * Phase 0.8.3 — Schema bootstrap drift guard.
 *
 * The home page crashed on a fresh checkout because initializeDatabase() omits
 * columns added later by scripts/{addGroupNameToTeams,addGroupUuidColumn}.ts.
 * This test pins the CREATE TABLE schema to every column referenced by the
 * runtime route SELECTs, so future drift is a CI failure rather than an
 * event-day surprise.
 */

import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';

import { initializeDatabase, ensureColumns } from '../database';
import { TABLE_NAMES, DEFAULT_EVENT_KEY, EVENT_KEY } from '../constants';

type SqliteDb = Database<sqlite3.Database, sqlite3.Statement>;

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  pk: number;
}

async function openFreshInMemoryDb(): Promise<SqliteDb> {
  const db = await open({
    filename: ':memory:',
    driver: sqlite3.Database,
  });
  await initializeDatabase(db);
  return db;
}

async function columnNames(db: SqliteDb, table: string): Promise<string[]> {
  const cols = (await db.all(`PRAGMA table_info(${table})`)) as ColumnInfo[];
  return cols.map(c => c.name);
}

describe('initializeDatabase', () => {
  let db: SqliteDb;

  beforeEach(async () => {
    db = await openFreshInMemoryDb();
  });

  afterEach(async () => {
    await db.close();
  });

  describe('streams table', () => {
    it('has all columns referenced by runtime SELECTs', async () => {
      const cols = await columnNames(db, TABLE_NAMES.STREAMS);
      expect(cols).toEqual(
        expect.arrayContaining(['id', 'name', 'obs_source_name', 'url', 'team_id'])
      );
    });
  });

  describe('teams table', () => {
    it('has team_id and team_name', async () => {
      const cols = await columnNames(db, TABLE_NAMES.TEAMS);
      expect(cols).toEqual(expect.arrayContaining(['team_id', 'team_name']));
    });

    it('has group_name (required by /api/streams, /api/setActive, /api/syncGroups, /api/addStream)', async () => {
      const cols = await columnNames(db, TABLE_NAMES.TEAMS);
      expect(cols).toContain('group_name');
    });

    it('has group_uuid (required by /api/addStream, /api/createGroup)', async () => {
      const cols = await columnNames(db, TABLE_NAMES.TEAMS);
      expect(cols).toContain('group_uuid');
    });
  });

  describe('runtime SELECTs resolve without "no such column" errors', () => {
    it('/api/streams query', async () => {
      await expect(
        db.all(`
          SELECT s.*, t.team_name, t.group_name
          FROM ${TABLE_NAMES.STREAMS} s
          LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id
        `)
      ).resolves.toEqual([]);
    });

    it('/api/setActive query', async () => {
      await expect(
        db.get(
          `SELECT s.*, t.team_name, t.group_name
           FROM ${TABLE_NAMES.STREAMS} s
           LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id
           WHERE s.id = ?`,
          [1]
        )
      ).resolves.toBeUndefined();
    });

    it('/api/syncGroups query (group_name IS NULL filter)', async () => {
      await expect(
        db.all(
          `SELECT team_id, team_name FROM ${TABLE_NAMES.TEAMS} WHERE group_name IS NULL`
        )
      ).resolves.toEqual([]);
    });

    it('/api/addStream fetchTeamInfo query', async () => {
      await expect(
        db.get(
          `SELECT team_name, group_name, group_uuid FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
          [1]
        )
      ).resolves.toBeUndefined();
    });
  });

  it('is idempotent — running twice on the same DB does not throw', async () => {
    await expect(initializeDatabase(db)).resolves.not.toThrow();
  });

  describe('ensureColumns identifier guard', () => {
    it('adds a missing column with a safe identifier', async () => {
      await ensureColumns(db, TABLE_NAMES.STREAMS, [{ name: 'note', def: 'TEXT' }]);
      const cols = await columnNames(db, TABLE_NAMES.STREAMS);
      expect(cols).toContain('note');
    });

    it('rejects an unsafe table identifier (no injection into DDL)', async () => {
      await expect(
        ensureColumns(db, 'streams; DROP TABLE teams', [{ name: 'x', def: 'TEXT' }])
      ).rejects.toThrow(/unsafe table identifier/);
    });

    it('rejects an unsafe column identifier', async () => {
      await expect(
        ensureColumns(db, TABLE_NAMES.STREAMS, [{ name: 'x TEXT); DROP TABLE teams;--', def: 'TEXT' }])
      ).rejects.toThrow(/unsafe column identifier/);
    });
  });
});

describe('EVENT_KEY (active event)', () => {
  it('defaults to the 2026 summer SaT event', () => {
    // No EVENT_KEY in the test env, so the resolved key is the default. This
    // pins the backward-compatible default — changing it renames every table.
    expect(DEFAULT_EVENT_KEY).toBe('2026_summer_sat');
    expect(EVENT_KEY).toBe('2026_summer_sat');
  });

  it('resolves TABLE_NAMES to the 2026 SaT tables', () => {
    expect(TABLE_NAMES.TEAMS).toBe('teams_2026_summer_sat');
    expect(TABLE_NAMES.STREAMS).toBe('streams_2026_summer_sat');
  });
});
