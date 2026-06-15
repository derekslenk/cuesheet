import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { getTableName, BASE_TABLE_NAMES, cleanObsName } from '../lib/constants';
import { getTopLiveStreams, TwitchCredentialsError } from '../lib/twitch';
import { planLiveSeed } from '../lib/liveSeed';

/**
 * Seed a test event with REAL currently-live Twitch channels (top live overall),
 * so the labels/overlay/OBS can be tested over real live video.
 *
 * Fetches the top N live channels via the Twitch Helix API, spreads them across
 * a few distinctly-branded synthetic teams, and writes them to the test event's
 * tables (DB ONLY — no OBS). RESETS the target event each run.
 *
 * Requires Twitch app credentials in .env.local: TWITCH_CLIENT_ID,
 * TWITCH_CLIENT_SECRET (create an app at https://dev.twitch.tv/console/apps).
 * The npm script runs via `tsx --env-file=.env.local`.
 *
 * After seeding: set EVENT_KEY=<event> in .env.local, restart the app, then add
 * the streams through the UI so OBS wires them up (the existing pipeline pulls
 * the live Twitch video and the HTML label renders over it).
 *
 * Usage:
 *   npm run seed:live-test
 *   npm run seed:live-test -- --count 12 --teams 3 --event testing_2026
 */
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;

function parseArgs(argv: string[]) {
  const out = { count: 8, teams: 2, event: 'testing_2026' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--count') out.count = Number(argv[++i]);
    else if (argv[i] === '--teams') out.teams = Number(argv[++i]);
    else if (argv[i] === '--event') out.event = argv[++i];
  }
  return out;
}

async function seedLiveTestEvent() {
  const { count, teams, event } = parseArgs(process.argv.slice(2));
  if (!Number.isInteger(count) || count < 1) throw new Error('--count must be a positive integer');
  if (!Number.isInteger(teams) || teams < 1) throw new Error('--teams must be a positive integer');
  if (!EVENT_KEY_PATTERN.test(event)) {
    throw new Error(`--event=${event} is invalid; use lowercase letters, digits, and underscores`);
  }

  console.log(`Fetching top ${count} live Twitch channels...`);
  const live = await getTopLiveStreams(count);
  if (live.length === 0) throw new Error('Twitch returned no live streams');
  console.log(`Got ${live.length} live channels.`);

  const plan = planLiveSeed(live, teams);

  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  if (!fs.existsSync(FILE_DIRECTORY)) fs.mkdirSync(FILE_DIRECTORY, { recursive: true });
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  const streamsTable = getTableName(BASE_TABLE_NAMES.STREAMS, event);
  const teamsTable = getTableName(BASE_TABLE_NAMES.TEAMS, event);

  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  try {
    await db.exec('PRAGMA busy_timeout = 5000;');
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
    await db.run(`DELETE FROM ${streamsTable}`);
    await db.run(`DELETE FROM ${teamsTable}`);
    // Reset AUTOINCREMENT so ids restart at 1 each run (matches setupTestEvent).
    try {
      await db.run('DELETE FROM sqlite_sequence WHERE name IN (?, ?)', [streamsTable, teamsTable]);
    } catch {
      // sqlite_sequence only exists once an AUTOINCREMENT row has been inserted
    }

    let streamRows = 0;
    for (const team of plan) {
      await db.run(
        `INSERT INTO ${teamsTable}
          (team_id, team_name, group_name, group_uuid, color_bg, color_accent, color_text, logo_path)
         VALUES (?, ?, ?, NULL, ?, ?, ?, ?)`,
        [team.team_id, team.team_name, team.team_name, team.color_bg, team.color_accent, team.color_text, team.logo_path]
      );
      for (const s of team.streams) {
        const obsSourceName = `${cleanObsName(team.team_name)}_${cleanObsName(s.login)}`;
        await db.run(
          `INSERT INTO ${streamsTable} (name, obs_source_name, url, team_id) VALUES (?, ?, ?, ?)`,
          [s.name, obsSourceName, `https://www.twitch.tv/${s.login}`, team.team_id]
        );
        streamRows++;
      }
    }

    const rows = await db.all(
      `SELECT s.id, s.name, t.team_name FROM ${streamsTable} s
       JOIN ${teamsTable} t ON s.team_id = t.team_id ORDER BY s.id`
    );
    console.log(`Seeded ${event}: ${plan.length} teams, ${streamRows} live streams.`);
    for (const r of rows) console.log(`  id=${r.id}  ${r.team_name} / ${r.name}`);
    console.log(`\nNext: set EVENT_KEY=${event} in .env.local, restart the app, add the streams via the UI.`);
  } finally {
    await db.close();
  }
}

seedLiveTestEvent()
  .then(() => process.exit(0))
  .catch((error) => {
    if (error instanceof TwitchCredentialsError) {
      console.error(`\n${error.message}\n`);
    } else {
      console.error('Error seeding live test event:', error.message || error);
    }
    process.exit(1);
  });
