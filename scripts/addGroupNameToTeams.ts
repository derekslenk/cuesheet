import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { getTableName, BASE_TABLE_NAMES } from '../lib/constants';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');

const addGroupNameToTeams = async () => {
  try {
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    
    // Open database connection
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    
    console.log('Database connection established.');
    
    // Generate table name for teams
    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });
    
    console.log(`Adding group_name column to ${teamsTableName}`);
    
    // Check if column already exists
    const tableInfo = await db.all(`PRAGMA table_info(${teamsTableName})`);
    const hasGroupName = tableInfo.some(col => col.name === 'group_name');
    
    if (!hasGroupName) {
      // Add group_name column
      await db.exec(`
        ALTER TABLE ${teamsTableName}
        ADD COLUMN group_name TEXT
      `);
      
      console.log(`✅ Added group_name column to ${teamsTableName}`);
    } else {
      console.log(`ℹ️  group_name column already exists in ${teamsTableName}`);
    }
    
    // Close database connection
    await db.close();
    console.log('Database connection closed.');
    console.log('✅ Successfully updated teams table schema!');
    
  } catch (error) {
    console.error('Error updating table:', error);
    process.exit(1);
  }
};

// Run the script
addGroupNameToTeams();