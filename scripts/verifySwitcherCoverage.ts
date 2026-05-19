/**
 * Verifies that for every stream in the DB, the stream-group name produced by
 * `setActive` exists as a `value` in each `source_switcher` source in the OBS
 * scene-collection JSON.
 *
 * PURPOSE: S4' pre-mortem kill switch — catches mismatches between what the
 * webui writes to the switcher file and what the OBS plugin's sources list
 * actually contains.
 *
 * Usage:
 *   npx tsx scripts/verifySwitcherCoverage.ts
 *   npx tsx scripts/verifySwitcherCoverage.ts --scene /path/to/scene.json --db /path/to/sources.db
 *
 * Exit 0 — all switchers have full coverage (or DB is empty/missing).
 * Exit 1 — one or more switchers are missing entries.
 */

import * as fs from 'fs';
import * as path from 'path';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { TABLE_NAMES } from '../lib/constants';
import { buildStreamGroupName, type StreamGroupInput } from '../lib/streamGroupName';

// ── CLI arg parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);

let scenePath = path.resolve(process.cwd(), 'obs-scene/SaT.json');
let dbPath = path.join(path.resolve(process.env.FILE_DIRECTORY || './files'), 'sources.db');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--scene' && args[i + 1]) {
    scenePath = path.resolve(args[++i]);
  } else if (args[i] === '--db' && args[i + 1]) {
    dbPath = path.resolve(args[++i]);
  }
}

// ── Type helpers ─────────────────────────────────────────────────────────────

interface SwitcherSource {
  value: string;
  [key: string]: unknown;
}

interface SceneSourceEntry {
  id: string;
  name: string;
  settings: {
    sources: SwitcherSource[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface SceneCollection {
  sources?: SceneSourceEntry[];
  [key: string]: unknown;
}

// ── Scene parsing ─────────────────────────────────────────────────────────────

function parseSwitcherCoverage(sceneJson: SceneCollection): Map<string, Set<string>> {
  const coverage = new Map<string, Set<string>>();
  for (const src of sceneJson.sources ?? []) {
    if (src.id !== 'source_switcher') continue;
    const values = new Set<string>((src.settings?.sources ?? []).map((s) => s.value));
    // If the same switcher name appears more than once, keep the larger set.
    const existing = coverage.get(src.name);
    if (!existing || values.size > existing.size) {
      coverage.set(src.name, values);
    }
  }
  return coverage;
}

// ── DB helpers ────────────────────────────────────────────────────────────────

async function queryStreams(dbFilePath: string): Promise<StreamGroupInput[]> {
  const db = await open({ filename: dbFilePath, driver: sqlite3.Database });

  try {
    // Try with group_name first (present after addGroupNameToTeams migration).
    try {
      const rows = await db.all<StreamGroupInput[]>(
        `SELECT s.name, t.team_name, t.group_name
         FROM ${TABLE_NAMES.STREAMS} s
         LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id`,
      );
      return rows;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!msg.includes('no such column')) throw err;
      // Fall back: teams table lacks group_name (pre-migration DB).
      const rows = await db.all<Array<{ name: string; team_name: string | null }>>(
        `SELECT s.name, t.team_name
         FROM ${TABLE_NAMES.STREAMS} s
         LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id`,
      );
      return rows.map((r) => ({ ...r, group_name: null }));
    }
  } finally {
    await db.close();
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Step 1: Parse scene JSON.
  if (!fs.existsSync(scenePath)) {
    console.error(`❌ Scene file not found: ${scenePath}`);
    process.exit(1);
  }

  const sceneJson = JSON.parse(fs.readFileSync(scenePath, 'utf8')) as SceneCollection;
  const switcherCoverage = parseSwitcherCoverage(sceneJson);

  if (switcherCoverage.size === 0) {
    console.warn('⚠️  No source_switcher sources found in scene file.');
  } else {
    console.log(
      `Scene: ${path.basename(scenePath)} — switchers: ${[...switcherCoverage.keys()].sort().join(', ')}`,
    );
  }

  // Step 2: Load streams from DB, handling missing DB/tables gracefully.
  let streams: StreamGroupInput[] = [];

  if (!fs.existsSync(dbPath)) {
    console.log(`ℹ️  DB not found at ${dbPath} — treating as 0 streams.`);
  } else {
    try {
      streams = await queryStreams(dbPath);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('no such table')) {
        console.log(`ℹ️  Tables not yet created in DB (${msg}) — treating as 0 streams.`);
      } else {
        throw err;
      }
    }
  }

  // Step 3: Derive stream-group names (same logic as setActive:46-49).
  const streamGroupNames = streams.map(buildStreamGroupName);

  const numSwitchers = switcherCoverage.size;
  const totalExpected = streamGroupNames.length * numSwitchers;

  if (streamGroupNames.length === 0) {
    console.log(
      `✅ Switcher coverage check: 0 stream groups × ${numSwitchers} switchers = 0 expected; 0 matched`,
    );
    process.exit(0);
  }

  // Step 4: Check coverage per switcher.
  let totalMatched = 0;
  const missingMap = new Map<string, string[]>();

  for (const [switcherName, values] of switcherCoverage) {
    const missing: string[] = [];
    for (const sgn of streamGroupNames) {
      if (values.has(sgn)) {
        totalMatched++;
      } else {
        missing.push(sgn);
      }
    }
    if (missing.length > 0) {
      missingMap.set(switcherName, missing);
    }
  }

  // Step 5: Report.
  if (missingMap.size === 0) {
    console.log(
      `✅ Switcher coverage check: ${streamGroupNames.length} stream groups × ${numSwitchers} switchers = ${totalExpected} expected; ${totalMatched} matched`,
    );
    process.exit(0);
  }

  console.error(
    `❌ Switcher coverage check: ${streamGroupNames.length} stream groups × ${numSwitchers} switchers = ${totalExpected} expected; ${totalMatched} matched`,
  );
  for (const [switcherName, missing] of [...missingMap.entries()].sort()) {
    console.error(`  Missing in ${switcherName}: ${missing.join(', ')}`);
  }
  process.exit(1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
