import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import fs from 'fs';
import { getTableName, BASE_TABLE_NAMES, DEFAULT_EVENT_KEY } from '../lib/constants';
import { readEnvVar, upsertEnvVar } from '../lib/envFile';

/**
 * Guarded helper for switching the app from one event to another, including the
 * OBS side. It does NOT touch OBS itself (that stays a deliberate, backed-up
 * step) and by default does NOT edit .env.local — it validates the target event
 * and prints the full checklist. Pass --write-env to flip EVENT_KEY for you.
 *
 * Usage:
 *   npm run event:switch -- --to testing_2026
 *   npm run event:switch -- --to testing_2026 --write-env          # also edit .env.local
 *   npm run event:switch -- --to testing_2026 --host 192.168.13.21 # tailor the printed OBS clean cmd
 */
const EVENT_KEY_PATTERN = /^[a-z0-9][a-z0-9_]*$/;
const ENV_PATH = path.resolve('.env.local');

function arg(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
}

async function countRows(db: Awaited<ReturnType<typeof open>>, table: string): Promise<number | null> {
  try {
    const row = await db.get(`SELECT COUNT(*) AS n FROM ${table}`);
    return row?.n ?? 0;
  } catch {
    return null; // table doesn't exist for this event yet
  }
}

async function switchEvent() {
  const argv = process.argv.slice(2);
  const to = arg(argv, '--to');
  const writeEnv = argv.includes('--write-env');
  const host = arg(argv, '--host') || '127.0.0.1';

  if (!to) throw new Error('Missing --to <event_key>');
  if (!EVENT_KEY_PATTERN.test(to)) {
    throw new Error(`--to=${to} is invalid; use lowercase letters, digits, and underscores`);
  }

  const envContent = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const current = readEnvVar(envContent, 'EVENT_KEY') ?? DEFAULT_EVENT_KEY;

  if (current === to) {
    console.log(`EVENT_KEY is already "${to}". Nothing to switch.`);
    return;
  }

  // Inspect the target event's tables so we can warn if it's empty.
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
  let teams: number | null = null;
  let streams: number | null = null;
  if (fs.existsSync(dbPath)) {
    const db = await open({ filename: dbPath, driver: sqlite3.Database });
    try {
      teams = await countRows(db, getTableName(BASE_TABLE_NAMES.TEAMS, to));
      streams = await countRows(db, getTableName(BASE_TABLE_NAMES.STREAMS, to));
    } finally {
      await db.close();
    }
  }

  const cleanCmd = host === '127.0.0.1'
    ? 'npm run clean:obs-collection'
    : `npm run clean:obs-collection -- --host ${host}`;

  console.log(`\nSwitch event:  ${current}  ->  ${to}\n`);
  console.log(`Target event data (${dbPath}):`);
  console.log(`  teams_${to}:   ${teams === null ? 'MISSING (no table yet)' : teams}`);
  console.log(`  streams_${to}: ${streams === null ? 'MISSING (no table yet)' : streams}`);
  if (!teams && !streams) {
    console.log(`  ⚠ Target event is empty — seed it first:`);
    console.log(`      npm run setup:test-event        (synthetic branded sandbox)`);
    console.log(`      npm run seed:live-test          (real live Twitch channels — needs Twitch creds)`);
    console.log(`      npm run clone:event -- --from ${current} --to ${to}   (copy this event's teams/streams)`);
  }

  console.log(`\nOBS — start fresh WITHOUT losing your switcher arrangement:`);
  console.log(`  1. BACK UP your scene collection first:`);
  console.log(`     Windows (Scoop): %USERPROFILE%\\scoop\\persist\\obs-studio\\config\\obs-studio\\basic\\scenes\\*.json`);
  console.log(`  2. In OBS: Scene Collection -> Duplicate the current one (so the original stays intact),`);
  console.log(`     then switch OBS to the duplicate.`);
  console.log(`  3. Strip the duplicate down to infrastructure (this KEEPS the 1/2/4-Screen scenes and the`);
  console.log(`     positioned ss_* switchers — it only empties their source lists):`);
  console.log(`       ${cleanCmd}              # dry-run (lists what it would remove)`);
  console.log(`       ${cleanCmd} -- --apply   # apply  (note: '--' once; if --host present, flags follow it)`);
  console.log(`  4. Add the new event's streams via the UI (they wire their OBS scenes + labels).`);

  console.log(`\nEVENT_KEY:`);
  if (writeEnv) {
    if (envContent) fs.writeFileSync(`${ENV_PATH}.bak`, envContent);
    fs.writeFileSync(ENV_PATH, upsertEnvVar(envContent, 'EVENT_KEY', to));
    console.log(`  ✓ Set EVENT_KEY=${to} in .env.local (backup at .env.local.bak).`);
  } else {
    console.log(`  Set this in .env.local (or re-run with --write-env):`);
    console.log(`      EVENT_KEY=${to}`);
  }
  console.log(`\n  Then RESTART the webui (and the supervisor if running) so both read the new EVENT_KEY.`);
  console.log(`  To return: switch OBS back to the original collection + set EVENT_KEY=${current} + restart.\n`);
}

switchEvent()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error switching event:', error.message || error);
    process.exit(1);
  });
