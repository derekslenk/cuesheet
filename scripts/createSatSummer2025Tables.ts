import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { getTableName, BASE_TABLE_NAMES } from '../lib/constants';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');

const ensureDirectoryExists = (dirPath: string) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`Created directory: ${dirPath}`);
  }
};

const createSatSummer2025Tables = async () => {
  try {
    // Ensure the files directory exists
    ensureDirectoryExists(FILE_DIRECTORY);
    
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    
    // Open database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    
    console.log('Database connection established.');
    
    // Generate table names for sat_summer_2025 (historical event key — this
    // one-off targets the prior event's tables, not the active EVENT_KEY).
    const streamsTableName = getTableName(BASE_TABLE_NAMES.STREAMS, '2025_summer_sat');
    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, '2025_summer_sat');
    
    console.log(`Creating tables: ${streamsTableName} and ${teamsTableName}`);
    
    // Create streams table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${streamsTableName} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        obs_source_name TEXT NOT NULL,
        url TEXT NOT NULL,
        team_id INTEGER NOT NULL
      )
    `);
    
    console.log(`✅ Created table: ${streamsTableName}`);
    
    // Create teams table
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${teamsTableName} (
        team_id INTEGER PRIMARY KEY,
        team_name TEXT NOT NULL,
        group_name TEXT
      )
    `);
    
    console.log(`✅ Created table: ${teamsTableName}`);
    
    // Close database connection
    await db.close();
    console.log('Database connection closed.');
    console.log('✅ Successfully created sat_summer_2025 tables!');
    
  } catch (error) {
    console.error('Error creating tables:', error);
    process.exit(1);
  }
};

// Run the script
createSatSummer2025Tables();