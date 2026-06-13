/**
 * Import teams + streamers from the EK signup Google Sheet.
 *
 * The sheet lays each team out as a 3-row block:
 *   row 1: character/display names per role column
 *   row 2: Discord IDs
 *   row 3: Twitch URLs (sparse — only members who stream have one)
 * Role columns are E..K (Key Courier, Tank, Healer, DPS, DPS, Standby, Standby).
 * A member becomes a stream only when row 3 of their column holds a twitch.tv
 * URL; the display name comes from row 1 of the same column.
 *
 * Safe to re-run: the script diffs the sheet against the app and classifies
 * every entry as in-sync, new, changed, or no-longer-on-sheet. Matching is by
 * Twitch login first, then by team+name (which is how an edited URL shows up).
 * New entries are added; changed entries are only reported unless
 * --apply-changes is passed, because the app has no in-place rename — applying
 * a change means DELETE /api/streams/:id followed by a fresh /api/addStream
 * (which also re-bakes the plate with current styling). Entries that exist in
 * the app but not on the sheet are reported and never touched.
 *
 * Usage:
 *   npm run import:sheet -- --dry-run          # full report, no writes
 *   npm run import:sheet                       # add new teams/streams; report changes
 *   npm run import:sheet -- --apply-changes    # also delete+re-add changed streams
 *   tsx scripts/importFromSheet.ts --parse-only         # parse sheet only, no app contact
 *   tsx scripts/importFromSheet.ts --csv path/to.csv    # parse a local CSV instead of fetching
 *   tsx scripts/importFromSheet.ts --base-url http://host:3000
 *
 * Requires the cuesheet server to be running (and OBS connected, since
 * /api/addStream wires up OBS scenes live and rolls back on failure).
 *
 * SHEET_ID and SHEET_GID (the private signup sheet) are read from .env.local
 * (gitignored) — set them there. They are intentionally NOT committed.
 */

import { existsSync, readFileSync } from 'node:fs';

/**
 * Load .env.local (gitignored) into process.env before reading config, so the
 * private signup-sheet id/gid stay out of the (public) repo. Does not override
 * variables already set in the environment.
 */
function loadEnvLocal(): void {
  if (!existsSync('.env.local')) return;
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadEnvLocal();

// Private signup sheet — id/gid come from .env.local (gitignored); never committed.
const SHEET_ID = process.env.SHEET_ID ?? '';
const SHEET_GID = process.env.SHEET_GID ?? '';
const SHEET_CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

const ROLE_COLUMNS: Array<{ index: number; role: string }> = [
  { index: 4, role: 'Key Courier' },
  { index: 5, role: 'Tank' },
  { index: 6, role: 'Healer' },
  { index: 7, role: 'DPS' },
  { index: 8, role: 'DPS' },
  { index: 9, role: 'Standby' },
  { index: 10, role: 'Standby' },
];

const TEMPLATE_TEAM_NAME = 'YOURTEAMNAMEHERE';

interface SheetStreamer {
  team: string;
  name: string;
  login: string;
  role: string;
}

interface SheetTeam {
  name: string;
  streamers: SheetStreamer[];
}

interface ApiTeam {
  team_id: number;
  team_name: string;
  group_name: string | null;
  group_uuid: string | null;
}

interface ApiStream {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
  team_id: number;
  team_name: string | null;
}

interface StreamChange {
  existing: ApiStream;
  desired: SheetStreamer;
  reasons: string[];
}

// --- CSV parsing (quotes, "" escapes, newlines inside quoted cells) ---------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      rows.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// --- Sheet interpretation ----------------------------------------------------

/** Accepts https://www.twitch.tv/x, http://, bare twitch.tv/x, trailing slashes. */
function extractTwitchLogin(value: string | undefined): string | null {
  if (!value) return null;
  const match = value.match(/twitch\.tv\/([A-Za-z0-9_]+)/i);
  return match ? match[1].toLowerCase() : null;
}

function normalizeName(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function parseSheet(rows: string[][]): SheetTeam[] {
  // Group consecutive rows sharing the same non-empty column A into blocks.
  const blocks: string[][][] = [];
  let current: string[][] = [];
  let currentKey = '';
  for (const row of rows) {
    const key = (row[0] ?? '').trim();
    if (key && key === currentKey) {
      current.push(row);
    } else {
      if (current.length > 0) blocks.push(current);
      current = key ? [row] : [];
      currentKey = key;
    }
  }
  if (current.length > 0) blocks.push(current);

  const teams: SheetTeam[] = [];
  for (const block of blocks) {
    const [names, , urls] = [block[0], block[1], block[2]];
    const teamName = (names[2] ?? '').trim() || (names[0] ?? '').trim();
    const slotNumber = (names[1] ?? '').trim();
    // Skip the header block ("Helper"/"#") and the signup template.
    if (!teamName || teamName === TEMPLATE_TEAM_NAME || !/^\d+$/.test(slotNumber)) continue;
    if (!urls) continue; // block too short to carry Twitch URLs

    const streamers: SheetStreamer[] = [];
    for (const { index, role } of ROLE_COLUMNS) {
      const login = extractTwitchLogin(urls[index]);
      if (!login) continue;
      const display = normalizeName(names[index] ?? '') || login;
      streamers.push({ team: teamName, name: display, login, role });
    }
    teams.push({ name: teamName, streamers });
  }
  return teams;
}

// --- API helpers ---------------------------------------------------------------

async function apiGet<T>(baseUrl: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}${path}`);
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status}`);
  const body = (await res.json()) as { success: boolean; data: T };
  return body.data;
}

async function apiSend(
  baseUrl: string,
  method: 'POST' | 'DELETE',
  path: string,
  payload?: unknown
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: payload !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: payload !== undefined ? JSON.stringify(payload) : undefined,
  });
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON error body; status is enough */
  }
  return { status: res.status, body };
}

// --- Main ----------------------------------------------------------------------

async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const parseOnly = argv.includes('--parse-only');
  const applyChanges = argv.includes('--apply-changes');
  const getFlag = (name: string): string | undefined => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const baseUrl = (getFlag('--base-url') ?? process.env.CUESHEET_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const csvPath = getFlag('--csv');

  // 1. Load the sheet
  let csvText: string;
  if (csvPath) {
    const { readFile } = await import('node:fs/promises');
    csvText = await readFile(csvPath, 'utf8');
    console.log(`Parsing local CSV: ${csvPath}`);
  } else {
    if (!SHEET_ID || !SHEET_GID) {
      throw new Error(
        'SHEET_ID and SHEET_GID are not set — add them to .env.local (gitignored), ' +
          'or pass --csv <path> / --parse-only.',
      );
    }
    console.log('Fetching sheet CSV from Google...');
    const res = await fetch(SHEET_CSV_URL, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status} ${res.statusText}`);
    csvText = await res.text();
  }

  const sheetTeams = parseSheet(parseCsv(csvText));

  // Dedup logins across the whole sheet (first occurrence wins).
  const seenLogins = new Map<string, SheetStreamer>();
  for (const team of sheetTeams) {
    team.streamers = team.streamers.filter((s) => {
      const first = seenLogins.get(s.login);
      if (first) {
        console.warn(`  ! duplicate login "${s.login}" (${s.team}/${s.name}) — keeping ${first.team}/${first.name}`);
        return false;
      }
      seenLogins.set(s.login, s);
      return true;
    });
  }

  const totalStreamers = sheetTeams.reduce((n, t) => n + t.streamers.length, 0);
  console.log(`\nParsed ${sheetTeams.length} teams, ${totalStreamers} streamers:\n`);
  for (const team of sheetTeams) {
    console.log(`  ${team.name}`);
    for (const s of team.streamers) {
      console.log(`    - ${s.name} (${s.role}) -> twitch.tv/${s.login}`);
    }
  }

  if (parseOnly) return;

  // 2. Fetch current app state
  console.log(`\nQuerying app state at ${baseUrl} ...`);
  const existingTeams = await apiGet<ApiTeam[]>(baseUrl, '/api/teams');
  const existingStreams = await apiGet<ApiStream[]>(baseUrl, '/api/streams');

  const teamsByName = new Map(existingTeams.map((t) => [t.team_name.trim().toLowerCase(), t]));
  const existingByLogin = new Map<string, ApiStream>();
  for (const s of existingStreams) {
    const login = extractTwitchLogin(s.url);
    if (login && !existingByLogin.has(login)) existingByLogin.set(login, s);
  }
  const teamNameKey = (team: string, name: string) =>
    `${team.trim().toLowerCase()}|${normalizeName(name).toLowerCase()}`;
  const existingByTeamAndName = new Map<string, ApiStream>();
  for (const s of existingStreams) {
    if (s.team_name) existingByTeamAndName.set(teamNameKey(s.team_name, s.name), s);
  }

  // 3. Classify every sheet entry: in-sync, new, or changed.
  //    Matching by login catches name/team edits; matching by team+name
  //    catches URL edits (the login itself changed).
  const toAdd: SheetStreamer[] = [];
  const toChange: StreamChange[] = [];
  const matchedStreamIds = new Set<number>();
  let inSync = 0;

  for (const s of sheetTeams.flatMap((t) => t.streamers)) {
    const byLogin = existingByLogin.get(s.login);
    if (byLogin) {
      matchedStreamIds.add(byLogin.id);
      const reasons: string[] = [];
      if (normalizeName(byLogin.name) !== s.name) {
        reasons.push(`name "${byLogin.name}" -> "${s.name}"`);
      }
      if ((byLogin.team_name ?? '').trim().toLowerCase() !== s.team.toLowerCase()) {
        reasons.push(`team "${byLogin.team_name ?? '?'}" -> "${s.team}"`);
      }
      if (reasons.length > 0) {
        toChange.push({ existing: byLogin, desired: s, reasons });
      } else {
        inSync++;
      }
      continue;
    }

    const byTeamAndName = existingByTeamAndName.get(teamNameKey(s.team, s.name));
    if (byTeamAndName && !matchedStreamIds.has(byTeamAndName.id)) {
      matchedStreamIds.add(byTeamAndName.id);
      const oldLogin = extractTwitchLogin(byTeamAndName.url) ?? byTeamAndName.url;
      toChange.push({
        existing: byTeamAndName,
        desired: s,
        reasons: [`twitch "${oldLogin}" -> "${s.login}"`],
      });
      continue;
    }

    toAdd.push(s);
  }

  const notOnSheet = existingStreams.filter((s) => !matchedStreamIds.has(s.id));

  // 4. Report the plan
  console.log('\n--- Plan ---');
  console.log(`In sync: ${inSync}`);
  for (const s of toAdd) {
    console.log(`[new   ] ${s.name} (twitch.tv/${s.login}) -> ${s.team}`);
  }
  for (const c of toChange) {
    console.log(`[change] stream ${c.existing.id} "${c.existing.name}": ${c.reasons.join(', ')}`);
  }
  for (const s of notOnSheet) {
    console.log(`[extra ] stream ${s.id} "${s.name}" (${s.team_name ?? 'no team'}) — in app but not on sheet (left alone)`);
  }
  if (toAdd.length === 0 && toChange.length === 0) {
    console.log('Nothing to do.');
  }

  if (dryRun) {
    console.log(`\nDry run: would add ${toAdd.length}, change ${toChange.length}` +
      (toChange.length > 0 && !applyChanges ? ' (changes need --apply-changes)' : '') +
      '. No changes made.');
    return;
  }
  if (toChange.length > 0 && !applyChanges) {
    console.log('\nChanges detected but NOT applied (re-run with --apply-changes to delete+re-add them).');
  }

  // 5. Apply
  let teamsAdded = 0;
  let streamsAdded = 0;
  let streamsChanged = 0;
  const failures: string[] = [];

  const ensureTeam = async (teamName: string): Promise<ApiTeam | null> => {
    const existing = teamsByName.get(teamName.toLowerCase());
    if (existing) return existing;
    const { status, body } = await apiSend(baseUrl, 'POST', '/api/teams', { team_name: teamName });
    if (status === 201) {
      const created = (body as { data: ApiTeam }).data;
      teamsByName.set(teamName.toLowerCase(), created);
      console.log(`[add   ] team "${teamName}" (id ${created.team_id})`);
      teamsAdded++;
      return created;
    }
    failures.push(`team "${teamName}": HTTP ${status} ${JSON.stringify(body)}`);
    console.error(`[FAIL  ] team "${teamName}": HTTP ${status}`);
    return null;
  };

  const addStream = async (s: SheetStreamer): Promise<boolean> => {
    const team = await ensureTeam(s.team);
    if (!team) return false;
    const { status, body } = await apiSend(baseUrl, 'POST', '/api/addStream', {
      name: s.name,
      url: `https://www.twitch.tv/${s.login}`,
      team_id: team.team_id,
    });
    if (status === 201) {
      console.log(`[add   ] stream ${s.name} (twitch.tv/${s.login}) -> ${s.team}`);
      return true;
    }
    if (status === 409) {
      console.log(`[skip  ] ${s.name} — server reports duplicate`);
      return false;
    }
    failures.push(`stream "${s.name}" (${s.team}): HTTP ${status} ${JSON.stringify(body)}`);
    console.error(`[FAIL  ] stream ${s.name}: HTTP ${status} ${JSON.stringify(body)}`);
    return false;
  };

  for (const s of toAdd) {
    if (await addStream(s)) streamsAdded++;
  }

  if (applyChanges) {
    for (const c of toChange) {
      // No in-place rename exists: delete (full OBS cleanup server-side), then
      // re-add, which also re-bakes the plate with current styling.
      const del = await apiSend(baseUrl, 'DELETE', `/api/streams/${c.existing.id}`);
      if (del.status !== 200) {
        failures.push(`delete stream ${c.existing.id} "${c.existing.name}": HTTP ${del.status} ${JSON.stringify(del.body)}`);
        console.error(`[FAIL  ] delete stream ${c.existing.id}: HTTP ${del.status}`);
        continue; // don't re-add on top of a failed delete
      }
      console.log(`[delete] stream ${c.existing.id} "${c.existing.name}" (${c.reasons.join(', ')})`);
      if (await addStream(c.desired)) streamsChanged++;
    }
  }

  // 6. Summary
  console.log('\n--- Summary ---');
  console.log(
    `Teams added: ${teamsAdded}, streams added: ${streamsAdded}, changed: ${streamsChanged}` +
      (applyChanges ? '' : ` (${toChange.length} pending)`) +
      `, in sync: ${inSync}, not on sheet: ${notOnSheet.length}, failed: ${failures.length}`
  );
  if (failures.length > 0) {
    console.error('\nFailures:');
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Import failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
