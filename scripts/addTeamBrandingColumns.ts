import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { TABLE_NAMES } from '../lib/constants';

/**
 * Idempotent migration: add the per-team branding columns used by the HTML
 * stream-label overlay (plan Phase 1 / US-003) to the CURRENT event's teams
 * table. All columns are nullable; unset values fall back to the event-default
 * palette in lib/overlayData.ts, so adding them changes nothing until an
 * operator sets a team's colors/logo. Safe to re-run.
 *
 * Mirrors scripts/addGroupUuidColumn.ts, but targets TABLE_NAMES.TEAMS (the
 * current EVENT_KEY), not a historical event.
 *
 * Run: npm run add-team-branding-columns
 */
const BRANDING_COLUMNS = ['color_bg', 'color_accent', 'color_text', 'logo_path'] as const;

async function addTeamBrandingColumns() {
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  const teamsTable = TABLE_NAMES.TEAMS;

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    const columns = await db.all(`PRAGMA table_info(${teamsTable})`);
    const existing = new Set(columns.map((c: { name: string }) => c.name));

    let added = 0;
    for (const col of BRANDING_COLUMNS) {
      if (existing.has(col)) {
        console.log(`${col} already exists on ${teamsTable} — skipping`);
        continue;
      }
      await db.run(`ALTER TABLE ${teamsTable} ADD COLUMN ${col} TEXT NULL`);
      console.log(`Added ${col} to ${teamsTable}`);
      added++;
    }

    console.log(
      added === 0
        ? 'No changes — all branding columns already present.'
        : `Successfully added ${added} branding column(s) to ${teamsTable}.`
    );
  } finally {
    await db.close();
  }
}

addTeamBrandingColumns()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error adding team branding columns:', error);
    process.exit(1);
  });
