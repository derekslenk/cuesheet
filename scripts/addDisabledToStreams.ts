import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { getTableName, BASE_TABLE_NAMES, EVENT_KEY } from '../lib/constants';

/**
 * Idempotent migration: add the `disabled` column to the streams table.
 *
 * `disabled` is the durable backing for the supervisor control buttons: a value
 * of 1 marks a stream as operator-stopped so the streamlink supervisor skips it
 * on startup and excludes it from /reload reconciliation (scripts/streamlink-
 * supervisor/streamSpecsLoader.ts). New databases get the column from
 * lib/database.ts; this script brings existing event databases up to date.
 *
 * Targets the active EVENT_KEY by default. Pass an explicit key as argv[2] for
 * historical/cross-event tables (e.g. `tsx scripts/addDisabledToStreams.ts 2025_summer_sat`).
 */
async function addDisabledToStreams() {
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  const eventKey = process.argv[2] || EVENT_KEY;

  try {
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const streamsTableName = getTableName(BASE_TABLE_NAMES.STREAMS, eventKey);

    // Check if the column already exists
    const columns = await db.all(`PRAGMA table_info(${streamsTableName})`);
    const hasDisabled = columns.some((col: { name: string }) => col.name === 'disabled');

    if (hasDisabled) {
      console.log(`disabled column already exists on ${streamsTableName}`);
      await db.close();
      return;
    }

    await db.run(
      `ALTER TABLE ${streamsTableName} ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0`
    );

    console.log(`Successfully added disabled column to ${streamsTableName}`);

    await db.close();
  } catch (error) {
    console.error('Error adding disabled column:', error);
    process.exit(1);
  }
}

// Run the migration
addDisabledToStreams().then(() => {
  console.log('Migration completed');
  process.exit(0);
});
