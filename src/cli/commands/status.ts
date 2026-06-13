/**
 * `cuesheet status` — one-shot service status table.
 *
 * Probes the supervisor (:8080/health) and web UI (:3000) via lib/health.ts,
 * cross-references managed process records from lib/procState.ts, and prints a
 * human-readable table (or --json output). Exits 0 only when every expected
 * service is up; exits 1 otherwise so scripts/CI can gate on the result.
 *
 * Flags:
 *   --json       Machine-readable JSON array of status rows.
 *   --logs       Tail the last 20 lines of each per-process log file.
 *   --diagnose   Extra env/path diagnostic section (for `doctor`-lite use).
 */

import { parseArgs } from 'node:util';
import { checkHealth, deckDisplay, serviceState, STATE_GLYPH } from '../lib/health.js';
import { formatStreamLines } from '../lib/streamsView.js';
import * as procState from '../lib/procState.js';
import { tailLog } from '../lib/log.js';
import { logPathFor } from '../lib/paths.js';
import { EXIT, CliError } from '../lib/exit.js';
import type { CommandContext, HealthResult, ProcessRecord, Role } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Public run() entry point
// ---------------------------------------------------------------------------

export async function run(argv: string[], ctx: CommandContext): Promise<void> {
  const { values: flags } = parseArgs({
    args: argv,
    options: {
      json:     { type: 'boolean', default: false },
      logs:     { type: 'boolean', default: false },
      diagnose: { type: 'boolean', default: false },
    },
    strict: false,
  });

  const health  = await checkHealth();
  const records = procState.list(ctx.env);

  if (flags.json) {
    printJson(health, records, flags.logs as boolean, flags.diagnose as boolean, ctx);
  } else {
    printTable(health, records, flags.logs as boolean, flags.diagnose as boolean, ctx);
  }

  // Exit non-zero only when a service is genuinely DOWN — a service that is
  // still warming up (live PID, not answering yet) is not a failure.
  const broken = buildRows(health, records).some(
    (r) => serviceState(r.up, r.live === true) === 'down',
  );
  if (broken) {
    process.exitCode = EXIT.GENERIC;
  }
}

// ---------------------------------------------------------------------------
// Helpers — build a merged status row
// ---------------------------------------------------------------------------

interface StatusRow {
  service: Role;
  url: string;
  up: boolean;
  detail: string;
  latencyMs: number | null;
  pid: number | null;
  /** true when the PID in the record responds to kill(0) */
  live: boolean | null;
  logPath: string | null;
}

function buildRows(health: HealthResult[], records: ProcessRecord[]): StatusRow[] {
  const byRole = new Map<Role, ProcessRecord>(records.map((r) => [r.role, r]));

  return health.map((h): StatusRow => {
    const rec = byRole.get(h.service) ?? null;
    return {
      service:   h.service,
      url:       h.url,
      up:        h.up,
      detail:    h.detail,
      latencyMs: h.latencyMs,
      pid:       rec ? rec.pid : null,
      live:      rec ? procState.isLive(rec) : null,
      logPath:   rec ? rec.logPath : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Human-readable table output
// ---------------------------------------------------------------------------

const SVC_LABELS: Record<Role, string> = { sup: 'supervisor', web: 'web-ui', deck: 'stream-deck' };

function printTable(
  health: HealthResult[],
  records: ProcessRecord[],
  showLogs: boolean,
  showDiagnose: boolean,
  ctx: CommandContext,
): void {
  const rows = buildRows(health, records);
  const write = (s: string) => ctx.stdout.write(s + '\n');

  write('');
  write('  Service      Status   PID       Latency   Detail');
  write('  ──────────── ──────── ──────── ─────────  ──────────────────────────');

  for (const row of rows) {
    const state  = serviceState(row.up, row.live === true);
    const glyph  = STATE_GLYPH[state];
    const svc    = SVC_LABELS[row.service].padEnd(12);
    const status = ` ${glyph.label} `.padEnd(8);
    const sym    = glyph.symbol;
    const pid    = row.pid !== null ? String(row.pid).padEnd(8) : '—'.padEnd(8);
    const lat    = row.latencyMs !== null ? `${row.latencyMs} ms`.padStart(7) : '      —';
    const detail = state === 'starting' ? 'starting… (warming up)' : row.detail;

    write(`  ${sym} ${svc} ${status} ${pid} ${lat}   ${detail}`);
  }

  // Opt-in stream-deck sidecar: no HTTP probe (it owns a USB device, not a
  // port), so its row is synthesized from the tracked record. Deliberately NOT
  // part of the exit-code check above — a stopped opt-in deck is not a failure.
  {
    const rec = records.find((r) => r.role === 'deck') ?? null;
    const deck = deckDisplay(rec, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[deck.state];
    const svc = SVC_LABELS.deck.padEnd(12);
    const status = ` ${glyph.label} `.padEnd(8);
    const pid = deck.pid !== null ? String(deck.pid).padEnd(8) : '—'.padEnd(8);
    const lat = '      —';
    write(`  ${glyph.symbol} ${svc} ${status} ${pid} ${lat}   ${deck.detail}`);
  }

  write('');

  // Supervised streams (only present when the supervisor answered /health).
  const supStreams = health.find((h) => h.service === 'sup')?.streams;
  if (supStreams) {
    for (const line of formatStreamLines(supStreams, { color: process.stdout.isTTY === true })) {
      write(line);
    }
    write('');
  }

  if (showLogs) {
    printLogs(rows, ctx);
  }

  if (showDiagnose) {
    printDiagnose(rows, ctx);
  }
}

function printLogs(rows: StatusRow[], ctx: CommandContext): void {
  const write = (s: string) => ctx.stdout.write(s + '\n');

  for (const row of rows) {
    const logPath = row.logPath ?? logPathFor(row.service, process.env);
    const label   = SVC_LABELS[row.service];
    const lines   = tailLog(logPath, 20);

    write(`  ── ${label} log (${logPath}) ──`);
    if (lines.length === 0) {
      write('    (no log entries)');
    } else {
      for (const line of lines) {
        write(`    ${line}`);
      }
    }
    write('');
  }
}

function printDiagnose(rows: StatusRow[], ctx: CommandContext): void {
  const write = (s: string) => ctx.stdout.write(s + '\n');

  write('  ── diagnostics ──');
  write(`  platform : ${process.platform}`);
  write(`  node     : ${process.version}`);
  write(`  cwd      : ${process.cwd()}`);

  // Relevant env vars (values truncated for safety).
  const envKeys = ['CUESHEET_HOME', 'LOCALAPPDATA', 'HOME', 'XDG_STATE_HOME', 'PATH'];
  for (const key of envKeys) {
    const val = process.env[key];
    if (val !== undefined) {
      const truncated = val.length > 80 ? val.slice(0, 77) + '...' : val;
      write(`  ${key.padEnd(20)} ${truncated}`);
    }
  }

  write('');
  write('  ── process records ──');
  for (const row of rows) {
    if (row.pid !== null) {
      write(`  ${SVC_LABELS[row.service].padEnd(12)} pid=${row.pid}  live=${row.live}  log=${row.logPath ?? '—'}`);
    } else {
      write(`  ${SVC_LABELS[row.service].padEnd(12)} (no record)`);
    }
  }
  write('');
}

// ---------------------------------------------------------------------------
// JSON output
// ---------------------------------------------------------------------------

function printJson(
  health: HealthResult[],
  records: ProcessRecord[],
  showLogs: boolean,
  _showDiagnose: boolean,
  ctx: CommandContext,
): void {
  const rows = buildRows(health, records);

  const output = rows.map((row) => {
    const entry: Record<string, unknown> = {
      service:   row.service,
      url:       row.url,
      up:        row.up,
      state:     serviceState(row.up, row.live === true),
      detail:    row.detail,
      latencyMs: row.latencyMs,
      pid:       row.pid,
      live:      row.live,
      logPath:   row.logPath,
    };
    if (showLogs) {
      const logPath = row.logPath ?? logPathFor(row.service, process.env);
      entry.logs = tailLog(logPath, 20);
    }
    if (row.service === 'sup') {
      entry.streams = health.find((h) => h.service === 'sup')?.streams ?? [];
    }
    return entry;
  });

  // Append the synthesized deck row (no HTTP probe — see lib/health deckDisplay).
  const deckRec = records.find((r) => r.role === 'deck') ?? null;
  const deckLive = deckRec !== null && procState.isLive(deckRec);
  const deck = deckDisplay(deckRec, deckLive);
  output.push({
    service:   'deck',
    url:       null,
    up:        deckLive,
    state:     deck.state,
    detail:    deck.detail,
    latencyMs: null,
    pid:       deck.pid,
    live:      deckRec ? deckLive : null,
    logPath:   deckRec ? deckRec.logPath : null,
  });

  ctx.stdout.write(JSON.stringify(output, null, 2) + '\n');
}
