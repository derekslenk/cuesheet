import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { getTableName, BASE_TABLE_NAMES, cleanObsName } from '../lib/constants';

/**
 * Create + seed an isolated TEST event ("testing_2026") for trying out the
 * HTML stream-label overlay without touching the real event's data.
 *
 * - Targets `teams_testing_2026` / `streams_testing_2026` explicitly (NOT the
 *   active EVENT_KEY) so it's safe to run regardless of how the app is configured.
 * - Full current schema, including the per-team branding columns.
 * - RESETS the test event on every run (DELETE + re-seed) for a predictable
 *   sandbox. It only ever touches the testing_2026 tables.
 * - Seeds 3 synthetic teams with DISTINCT branding (colors + logo) and 2 streams
 *   each, so per-team labels can be previewed immediately on the overlay pages.
 *
 * To use it: set EVENT_KEY=testing_2026 in .env.local and restart the web app,
 * then visit /teams (branding) and /overlay/stream/<id>. Switch EVENT_KEY back
 * to 2026_summer_sat to return to the real event.
 *
 * Run: npm run setup:test-event
 */
const EVENT = 'testing_2026';

interface SeedStream {
  name: string;
  role: string;
}
interface SeedTeam {
  team_id: number;
  team_name: string;
  color_bg: string;
  color_accent: string;
  color_text: string;
  logo_path: string;
  streams: SeedStream[];
}

const SEED_TEAMS: SeedTeam[] = [
  {
    team_id: 1,
    team_name: 'Test Alpha',
    color_bg: '#14213d',
    color_accent: '#fca311',
    color_text: '#ffffff',
    logo_path: '/logos/test-alpha.svg',
    streams: [{ name: 'Nova', role: 'Tank' }, { name: 'Pixel', role: 'Healer' }],
  },
  {
    team_id: 2,
    team_name: 'Test Bravo',
    color_bg: '#2d6a4f',
    color_accent: '#d8f3dc',
    color_text: '#ffffff',
    logo_path: '/logos/test-bravo.svg',
    streams: [{ name: 'Echo', role: 'DPS' }, { name: 'Drift', role: 'DPS' }],
  },
  {
    team_id: 3,
    team_name: 'Test Crimson',
    color_bg: '#6a040f',
    color_accent: '#ffba08',
    color_text: '#ffffff',
    logo_path: '/logos/test-crimson.svg',
    streams: [{ name: 'Blaze', role: 'Key Courier' }, { name: 'Vex', role: 'Standby' }],
  },
];

async function setupTestEvent() {
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  if (!fs.existsSync(FILE_DIRECTORY)) fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');

  const streamsTable = getTableName(BASE_TABLE_NAMES.STREAMS, EVENT);
  const teamsTable = getTableName(BASE_TABLE_NAMES.TEAMS, EVENT);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA busy_timeout = 5000;');

    // Full current schema (mirrors lib/database.ts initializeDatabase).
    await db.exec(`
      CREATE TABLE IF NOT EXISTS ${streamsTable} (
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
      CREATE TABLE IF NOT EXISTS ${teamsTable} (
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

    // Reset for a predictable sandbox (testing_2026 only). Also reset the
    // AUTOINCREMENT sequence so re-runs always produce stable stream ids (1..N)
    // — handy since you reference /overlay/stream/<id>.
    await db.run(`DELETE FROM ${streamsTable}`);
    await db.run(`DELETE FROM ${teamsTable}`);
    try {
      await db.run('DELETE FROM sqlite_sequence WHERE name = ?', [streamsTable]);
    } catch {
      // sqlite_sequence only exists once an AUTOINCREMENT row has been inserted
    }

    for (const team of SEED_TEAMS) {
      await db.run(
        `INSERT INTO ${teamsTable}
          (team_id, team_name, group_name, group_uuid, color_bg, color_accent, color_text, logo_path)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [team.team_id, team.team_name, team.team_name, team.color_bg, team.color_accent, team.color_text, team.logo_path]
      );
      for (const stream of team.streams) {
        const obsSourceName = `${cleanObsName(team.team_name)}_${cleanObsName(stream.name)}`;
        await db.run(
          `INSERT INTO ${streamsTable} (name, obs_source_name, url, team_id, role) VALUES (?, ?, ?, ?, ?)`,
          [stream.name, obsSourceName, `https://www.twitch.tv/${obsSourceName}`, team.team_id, stream.role]
        );
      }
    }

    const teamCount = (await db.get(`SELECT COUNT(*) AS n FROM ${teamsTable}`)).n;
    const streamCount = (await db.get(`SELECT COUNT(*) AS n FROM ${streamsTable}`)).n;
    const rows = await db.all(
      `SELECT s.id, s.name, t.team_name FROM ${streamsTable} s
       JOIN ${teamsTable} t ON s.team_id = t.team_id ORDER BY s.id`
    );

    console.log(`Reset + seeded ${EVENT}: ${teamCount} teams, ${streamCount} streams.`);
    console.log('Stream ids for /overlay/stream/<id> :');
    for (const r of rows) console.log(`  id=${r.id}  ${r.team_name} / ${r.name}`);
    console.log(`\nTo use: set EVENT_KEY=${EVENT} in .env.local, restart the web app.`);
  } finally {
    await db.close();
  }
}

setupTestEvent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error setting up test event:', error);
    process.exit(1);
  });
