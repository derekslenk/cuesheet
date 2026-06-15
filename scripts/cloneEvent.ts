import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { getTableName, BASE_TABLE_NAMES } from '../lib/constants';

/**
 * Clone an event's data (all teams + streams) from one EVENT_KEY into another,
 * IN THE DATABASE ONLY. Lets you bootstrap a new event pre-populated from a
 * previous one instead of re-entering every team/stream.
 *
 * What it copies:
 *   - teams: team_id (preserved), team_name, group_name, and branding
 *     (color_bg/color_accent/color_text/logo_path). group_uuid is RESET to NULL
 *     because it ties a team to a specific OBS scene that does not exist in the
 *     new event yet.
 *   - streams: name, obs_source_name, url, team_id, disabled. New auto-increment
 *     ids are assigned in the target (source ids are not copied).
 *
 * What it does NOT do: it does not touch OBS. No scenes/sources are created.
 * Materialize OBS scenes for the new event afterwards by adding/activating its
 * streams through the app (which wires OBS) once EVENT_KEY points at the target.
 *
 * Safe by default: refuses to clone into a non-empty target unless --reset is
 * passed (which clears the target's teams+streams first). Only ever touches the
 * two named events' tables.
 *
 * Usage:
 *   npm run clone:event -- --from 2026_summer_sat --to worlds_2027
 *   npm run clone:event -- --from 2026_summer_sat --to worlds_2027 --reset
 */
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

function parseArgs(argv: string[]): { from?: string; to?: string; reset: boolean } {
  const out: { from?: string; to?: string; reset: boolean } = { reset: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') out.from = argv[++i];
    else if (argv[i] === '--to') out.to = argv[++i];
    else if (argv[i] === '--reset') out.reset = true;
  }
  return out;
}

function validateKey(label: string, key: string | undefined): string {
  if (!key) throw new Error(`Missing --${label} <event_key>`);
  if (!EVENT_KEY_PATTERN.test(key)) {
    throw new Error(`--${label}=${key} is invalid; use lowercase letters, digits, and underscores`);
  }
  return key;
}

async function cloneEvent() {
  const { from, to, reset } = parseArgs(process.argv.slice(2));
  const fromKey = validateKey('from', from);
  const toKey = validateKey('to', to);
  if (fromKey === toKey) throw new Error('--from and --to must be different event keys');

  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  if (!fs.existsSync(dbPath)) throw new Error(`Database not found at ${dbPath}`);

  const fromTeams = getTableName(BASE_TABLE_NAMES.TEAMS, fromKey);
  const fromStreams = getTableName(BASE_TABLE_NAMES.STREAMS, fromKey);
  const toTeams = getTableName(BASE_TABLE_NAMES.TEAMS, toKey);
  const toStreams = getTableName(BASE_TABLE_NAMES.STREAMS, toKey);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Source must exist.
    const srcTeamsExists = await db.get(
      `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
      [fromTeams]
    );
    if (!srcTeamsExists) throw new Error(`Source event "${fromKey}" has no ${fromTeams} table`);

    // Target schema (full current shape incl. branding).
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${toStreams} (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        obs_source_name TEXT NOT NULL,
        url TEXT NOT NULL,
        team_id INTEGER NOT NULL,
        disabled INTEGER NOT NULL DEFAULT 0,
        role TEXT
      )
    `);
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${toTeams} (
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

    // Guard a non-empty target.
    const existingTeams = (await db.get(`SELECT COUNT(*) AS n FROM ${toTeams}`)).n;
    const existingStreams = (await db.get(`SELECT COUNT(*) AS n FROM ${toStreams}`)).n;
    if ((existingTeams > 0 || existingStreams > 0) && !reset) {
      throw new Error(
        `Target event "${toKey}" already has ${existingTeams} teams / ${existingStreams} streams. ` +
        `Re-run with --reset to overwrite it.`
      );
    }

    await db.exec('BEGIN');
    try {
      if (reset) {
        await db.run(`DELETE FROM ${toStreams}`);
        await db.run(`DELETE FROM ${toTeams}`);
      }

      // Copy teams (SELECT * tolerates a source predating the branding columns —
      // missing fields read as undefined and are coalesced to null).
      const teams = await db.all(`SELECT * FROM ${fromTeams}`);
      for (const t of teams) {
        await db.run(
          `INSERT INTO ${toTeams}
            (team_id, team_name, group_name, group_uuid, color_bg, color_accent, color_text, logo_path)
           VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
          [
            t.team_id,
            t.team_name,
            t.group_name ?? null,
            t.color_bg ?? null,
            t.color_accent ?? null,
            t.color_text ?? null,
            t.logo_path ?? null,
          ]
        );
      }

      // Copy streams (new ids assigned by the target's autoincrement).
      let streams: Array<Record<string, unknown>> = [];
      const srcStreamsExists = await db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [fromStreams]
      );
      if (srcStreamsExists) {
        streams = await db.all(`SELECT * FROM ${fromStreams}`);
        for (const s of streams) {
          await db.run(
            `INSERT INTO ${toStreams} (name, obs_source_name, url, team_id, disabled, role) VALUES (?, ?, ?, ?, ?, ?)`,
            [s.name, s.obs_source_name, s.url, s.team_id, s.disabled ?? 0, s.role ?? null]
          );
        }
      }

      await db.exec('COMMIT');
      console.log(`Cloned ${fromKey} -> ${toKey}: ${teams.length} teams, ${streams.length} streams (DB only).`);
      console.log('group_uuid reset to NULL (OBS scenes are created when you add/activate streams under the new event).');
      console.log(`Next: set EVENT_KEY=${toKey} in .env.local and restart the app.`);
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }
  } finally {
    await db.close();
  }
}

cloneEvent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error cloning event:', error.message || error);
    process.exit(1);
  });
