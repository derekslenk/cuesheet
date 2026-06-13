/**
 * `cuesheet watch` — live 2-second poll monitor.
 *
 * Reprints the status table every 2 seconds (matching watch.ps1 cadence) until
 * the user presses Ctrl-C. Uses a plain stdout reprint rather than the TUI
 * render core — the full TUI dashboard lives in gui.ts (T11).
 *
 * The loop clears the terminal on each tick so the table appears to update
 * in-place without accumulating scroll history.
 */

import { parseArgs } from 'node:util';
import { checkHealth, serviceState, STATE_GLYPH } from '../lib/health.js';
import { formatStreamLines } from '../lib/streamsView.js';
import * as procState from '../lib/procState.js';
import type { CommandContext, HealthResult, ProcessRecord, Role } from '../lib/types.js';

/** Refresh interval in milliseconds (matches watch.ps1 cadence). */
const INTERVAL_MS = 2000;

const SVC_LABELS: Record<Role, string> = { sup: 'supervisor', web: 'web-ui', deck: 'stream-deck' };

// ANSI helpers — simple sequences; no external deps.
const CLEAR_SCREEN  = '\x1b[2J\x1b[H';
const CURSOR_HIDE   = '\x1b[?25l';
const CURSOR_SHOW   = '\x1b[?25h';

// ---------------------------------------------------------------------------
// Public run() entry point
// ---------------------------------------------------------------------------

export async function run(argv: string[], ctx: CommandContext): Promise<void> {
  const { values: flags } = parseArgs({
    args: argv,
    options: {
      // --interval <ms>: override poll interval (mostly for tests).
      interval: { type: 'string', default: String(INTERVAL_MS) },
    },
    strict: false,
  });

  const intervalMs = Math.max(500, parseInt(flags.interval as string, 10) || INTERVAL_MS);

  // Hide cursor while watching; restore on exit.
  ctx.stdout.write(CURSOR_HIDE);

  let stopped = false;

  const stop = () => {
    stopped = true;
    ctx.stdout.write(CURSOR_SHOW + '\n');
  };

  // Restore cursor on Ctrl-C / SIGTERM so the terminal is not left in a bad
  // state. We re-exit with code 130 (SIGINT convention) after cleanup.
  const sigintHandler  = () => { stop(); process.exit(130); };
  const sigtermHandler = () => { stop(); process.exit(143); };
  process.once('SIGINT',  sigintHandler);
  process.once('SIGTERM', sigtermHandler);

  try {
    while (!stopped) {
      const [health, records] = await Promise.all([
        checkHealth(),
        Promise.resolve(procState.list(ctx.env)),
      ]);

      if (!stopped) {
        ctx.stdout.write(CLEAR_SCREEN);
        printFrame(health, records, intervalMs, ctx);
      }

      // Sleep for the interval, broken into small slices so SIGINT is
      // delivered promptly on platforms where signal delivery requires the
      // event loop to yield.
      await sleep(intervalMs);
    }
  } finally {
    process.removeListener('SIGINT',  sigintHandler);
    process.removeListener('SIGTERM', sigtermHandler);
    stop();
  }
}

// ---------------------------------------------------------------------------
// Frame renderer (plain text — no TUI diff)
// ---------------------------------------------------------------------------

function printFrame(
  health: HealthResult[],
  records: ProcessRecord[],
  intervalMs: number,
  ctx: CommandContext,
): void {
  const write = (s: string) => ctx.stdout.write(s + '\n');
  const now   = new Date().toLocaleTimeString();

  write(`  cuesheet watch  (refreshing every ${intervalMs / 1000}s — Ctrl-C to stop)   ${now}`);
  write('');
  write('  Service      Status   PID       Latency   Detail');
  write('  ──────────── ──────── ──────── ─────────  ──────────────────────────');

  const byRole = new Map<Role, ProcessRecord>(records.map((r) => [r.role, r]));

  for (const h of health) {
    const rec    = byRole.get(h.service) ?? null;
    const state  = serviceState(h.up, rec !== null && procState.isLive(rec));
    const glyph  = STATE_GLYPH[state];
    const svc    = SVC_LABELS[h.service].padEnd(12);
    const status = ` ${glyph.label} `.padEnd(8);
    const sym    = glyph.symbol;
    const pid    = rec !== null ? String(rec.pid).padEnd(8) : '—'.padEnd(8);
    const lat    = h.latencyMs !== null ? `${h.latencyMs} ms`.padStart(7) : '      —';
    const detail = state === 'starting' ? 'starting… (warming up)' : h.detail;

    write(`  ${sym} ${svc} ${status} ${pid} ${lat}   ${detail}`);
  }

  const supStreams = health.find((h) => h.service === 'sup')?.streams;
  if (supStreams) {
    write('');
    for (const line of formatStreamLines(supStreams, { color: process.stdout.isTTY === true })) {
      write(line);
    }
  }

  write('');
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
