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
      disabled INTEGER NOT NULL DEFAULT 0
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