import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { TABLE_NAMES } from './constants';

let db: Database<sqlite3.Database, sqlite3.Statement> | null = null;

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files')

const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
};

// Idempotently add any missing columns to an existing table. SQLite has no
// "ADD COLUMN IF NOT EXISTS", so we check PRAGMA table_info first. This lets the
// app self-heal the schema of the active event's tables on startup — older event
// DBs created before a column existed get it automatically, without relying on a
// separate migration script having been run against the right DB.
const ensureColumns = async (
  database: Database<sqlite3.Database, sqlite3.Statement>,
  table: string,
  columns: { name: string; def: string }[]
) => {
  const info = await database.all(`PRAGMA table_info(${table})`);
  const existing = new Set(info.map((c: { name: string }) => c.name));
  for (const col of columns) {
    if (!existing.has(col.name)) {
      await database.exec(`ALTER TABLE ${table} ADD COLUMN ${col.name} ${col.def}`);
      console.log(`Added column ${col.name} to ${table}`);
    }
  }
};

export const initializeDatabase = async (database: Database<sqlite3.Database, sqlite3.Statement>) => {
  // Create streams table. `disabled` is also added (idempotently) by
  // scripts/addDisabledToStreams.ts for databases that predate this column.
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.STREAMS} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      obs_source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      team_id INTEGER NOT NULL,
      disabled INTEGER NOT NULL DEFAULT 0,
      role TEXT
    )
  `);

  // Create teams table. group_name / group_uuid are also added (idempotently)
  // by scripts/addGroupNameToTeams.ts and scripts/addGroupUuidColumn.ts, and
  // the color_*/logo_path branding columns by scripts/addTeamBrandingColumns.ts,
  // for databases that predate this CREATE TABLE. The branding columns drive the
  // HTML stream-label overlay; they are nullable and fall back to the event
  // defaults in lib/overlayData.ts.
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TEAMS} (
      team_id INTEGER PRIMARY KEY,
      team_name TEXT NOT NULL,
      group_name TEXT,
      group_uuid TEXT,
      color_bg TEXT,
      color_accent TEXT,
      color_text TEXT,
      logo_path TEXT
    )
  `);

  // Self-heal the active event's schema: add any columns that older event DBs
  // predate. Idempotent and additive — safe on every startup.
  await ensureColumns(database, TABLE_NAMES.STREAMS, [
    { name: 'disabled', def: 'INTEGER NOT NULL DEFAULT 0' },
    { name: 'role', def: 'TEXT' },
  ]);
  await ensureColumns(database, TABLE_NAMES.TEAMS, [
    { name: 'group_name', def: 'TEXT' },
    { name: 'group_uuid', def: 'TEXT' },
    { name: 'color_bg', def: 'TEXT' },
    { name: 'color_accent', def: 'TEXT' },
    { name: 'color_text', def: 'TEXT' },
    { name: 'logo_path', def: 'TEXT' },
  ]);

  console.log('Database tables initialized.');
};

export const getDatabase = async () => {
  if (!db) {
    // Ensure the files directory exists
    ensureDirectoryExists(FILE_DIRECTORY);
    
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    // WAL lets the web app and the streamlink supervisor read/write sources.db
    // concurrently (two processes). WAL is a persistent property of the DB file
    // (set once, idempotent); busy_timeout is per-connection and must be set on
    // every opener. WAL requires a LOCAL filesystem — keep FILE_DIRECTORY local.
    await db.exec('PRAGMA journal_mode = WAL;');
    await db.exec('PRAGMA busy_timeout = 5000;');
    console.log('Database connection established.');
    
    // Initialize database tables
    await initializeDatabase(db);
  }
  return db;
}

// export default getDatabase