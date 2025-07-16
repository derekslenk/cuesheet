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

const initializeDatabase = async (database: Database<sqlite3.Database, sqlite3.Statement>) => {
  // Create streams table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.STREAMS} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      obs_source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      team_id INTEGER NOT NULL
    )
  `);

  // Create teams table
  await database.exec(`
    CREATE TABLE IF NOT EXISTS ${TABLE_NAMES.TEAMS} (
      team_id INTEGER PRIMARY KEY,
      team_name TEXT NOT NULL
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
    console.log('Database connection established.');
    
    // Initialize database tables
    await initializeDatabase(db);
  }
  return db;
}

// export default getDatabase