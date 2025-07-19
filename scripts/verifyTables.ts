import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';

const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');

const verifyTables = async () => {
  try {
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    
    console.log('Checking all tables in the database...\n');
    
    // Get all table names
    const tables = await db.all(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);
    
    console.log('Tables found:');
    for (const table of tables) {
      console.log(`- ${table.name}`);
    }
    
    // Check sat_summer_2025 tables specifically
    const satSummerTables = tables.filter(t => 
      t.name.includes('2025_summer_sat')
    );
    
    if (satSummerTables.length > 0) {
      console.log('\n✅ sat_summer_2025 tables found:');
      for (const table of satSummerTables) {
        console.log(`   - ${table.name}`);
        
        // Get column info
        const columns = await db.all(`PRAGMA table_info(${table.name})`);
        console.log('     Columns:');
        for (const col of columns) {
          console.log(`       - ${col.name} (${col.type})`);
        }
      }
    } else {
      console.log('\n❌ No sat_summer_2025 tables found!');
    }
    
    await db.close();
    
  } catch (error) {
    console.error('Error verifying tables:', error);
    process.exit(1);
  }
};

verifyTables();