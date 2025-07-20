import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { getTableName, BASE_TABLE_NAMES } from '../lib/constants';

async function addGroupUuidColumn() {
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  
  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });

    // Check if column already exists
    const columns = await db.all(`PRAGMA table_info(${teamsTableName})`);
    const hasGroupUuid = columns.some((col: any) => col.name === 'group_uuid');
    
    if (hasGroupUuid) {
      console.log('group_uuid column already exists');
      await db.close();
      return;
    }

    // Add the new column
    await db.run(`ALTER TABLE ${teamsTableName} ADD COLUMN group_uuid TEXT NULL`);
    
    console.log('Successfully added group_uuid column to teams table');
    
    await db.close();
  } catch (error) {
    console.error('Error adding group_uuid column:', error);
    process.exit(1);
  }
}

// Run the migration
addGroupUuidColumn().then(() => {
  console.log('Migration completed');
  process.exit(0);
});