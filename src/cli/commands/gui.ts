/**
 * `cuesheet gui` (alias `dashboard`) — full-screen TUI control center.
 *
 * This is the CONTROLLER layer. It owns application state, the poll loop,
 * and keybinding dispatch. All low-level terminal I/O (cursor, raw mode,
 * diff render) is delegated to lib/tui.ts — that module stays logic-free.
 *
 * Layout (single panel, full-width):
 *   ╔═ cuesheet dashboard ════════════════════════════════════════════════╗
 *   ║  Service      Status   PID      Latency   Detail                   ║
 *   ║  ──────────── ──────── ──────── ─────────  ──────────────────────  ║
 *   ║  ✓ supervisor   up     12345       4 ms   HTTP 200                 ║
 *   ║  ✓ web-ui       up     12346       7 ms   HTTP 200                 ║
 *   ╟─ last updated: 12:34:56 ─ refreshing every 2s ──────────────────── ║
 *   ║  [s] start  [x] stop  [r] restart  [q] quit                       ║
 *   ╚═══════════════════════════════════════════════════════════════════ ═╝
 *
 * Keybindings:
 *   s  — start both services (same logic as `cuesheet start`)
 *   x  — stop  both services (same logic as `cuesheet stop`)
 *   r  — restart both (stop then start)
 *   q  — quit; also Ctrl-C / SIGTERM
 *
 * Start/stop/restart delegate to commands/start.ts and commands/stop.ts
 * run() so the logic is never duplicated.
 */

import {
  render,
  invalidate,
  onKey,
  startInput,
  cleanup,
  installSignalHandlers,
  linesToString,
} from '../lib/tui.js';
import { checkHealth, deckDisplay, serviceState, STATE_GLYPH } from '../lib/health.js';
import { formatStreamLines } from '../lib/streamsView.js';
import * as procState from '../lib/procState.js';
import { Writable } from 'node:stream';
import { run as startRun } from './start.js';
import { run as stopRun } from './stop.js';
import type { CommandContext, HealthResult, ProcessRecord, Role } from '../lib/types.js';

/** Poll interval in milliseconds. */
const POLL_MS = 2000;

/** Service display labels. */
const SVC_LABELS: Record<Role, string> = { sup: 'supervisor', web: 'web-ui', deck: 'stream-deck' };

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function run(_argv: string[], ctx: CommandContext): Promise<void> {
  // If stdout is not a TTY (piped/redirected), fall back to a single status
  // dump so scripts don't get garbled ANSI output.
  if (!process.stdout.isTTY) {
    await nonTtyFallback(ctx);
    return;
  }

  // Install SIGINT/SIGTERM handlers from the tui core — they call cleanup()
  // and exit with the correct code.
  installSignalHandlers();

  // Track whether an action is currently running so we don't queue concurrent
  // start/stop invocations.
  let busy = false;
  let running = true;
  let statusMsg = '';  // transient feedback line (cleared on next poll)

  // Build a shared CommandContext for delegated start/stop calls.
  // We silence their output (we control the screen); errors are caught below.
  // A sink that DROPS everything. Delegated start/stop must not write to the
  // terminal while we own the alt-screen — writing to process.stderr would
  // interleave with the ANSI render and corrupt the TUI.
  const devNull = new Writable({ write(_chunk, _enc, cb) { cb(); } });
  const silentCtx: CommandContext = {
    ...ctx,
    stdout: devNull,
    stderr: devNull,
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
    },
  };

  // ---------------------------------------------------------------------------
  // Snapshot state (updated on each poll tick)
  // ---------------------------------------------------------------------------
  let health: HealthResult[] = [];
  let records: ProcessRecord[] = [];

  async function poll(): Promise<void> {
    [health, records] = await Promise.all([
      checkHealth(),
      Promise.resolve(procState.list(ctx.env)),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Keybinding handler
  // ---------------------------------------------------------------------------
  onKey(({ str, key }) => {
    // Ctrl-C or q → quit immediately. In raw mode the terminal swallows SIGINT,
    // so Ctrl-C arrives here as a keypress. Restore the terminal and exit now
    // rather than waiting up to POLL_MS for the render loop to notice the flag.
    if ((key?.ctrl && key.name === 'c') || str === 'q' || str === 'Q') {
      running = false;
      cleanup();
      process.exit(0);
    }

    if (busy) {
      statusMsg = 'busy — wait for current action to finish';
      return;
    }

    if (str === 's' || str === 'S') {
      busy = true;
      statusMsg = 'starting services…';
      startRun([], silentCtx)
        .then(() => { statusMsg = 'start: done'; })
        .catch((e: unknown) => { statusMsg = `start failed: ${errMsg(e)}`; })
        .finally(() => { busy = false; });
    } else if (str === 'x' || str === 'X') {
      busy = true;
      statusMsg = 'stopping services…';
      stopRun([], silentCtx)
        .then(() => { statusMsg = 'stop: done'; })
        .catch((e: unknown) => { statusMsg = `stop failed: ${errMsg(e)}`; })
        .finally(() => { busy = false; });
    } else if (str === 'r' || str === 'R') {
      busy = true;
      statusMsg = 'restarting services…';
      stopRun([], silentCtx)
        .then(() => startRun([], silentCtx))
        .then(() => { statusMsg = 'restart: done'; })
        .catch((e: unknown) => { statusMsg = `restart failed: ${errMsg(e)}`; })
        .finally(() => { busy = false; });
    } else if (str === 'd' || str === 'D') {
      // Toggle the stream-deck sidecar (opt-in; deliberately not part of [s]/[x]/[r]).
      const deckRec = records.find((r) => r.role === 'deck') ?? null;
      const deckLive = deckRec !== null && procState.isLive(deckRec);
      busy = true;
      if (deckLive) {
        statusMsg = 'stopping stream-deck…';
        stopRun(['--which', 'deck'], silentCtx)
          .then(() => { statusMsg = 'stream-deck: stopped'; })
          .catch((e: unknown) => { statusMsg = `deck stop failed: ${errMsg(e)}`; })
          .finally(() => { busy = false; });
      } else {
        statusMsg = 'starting stream-deck…';
        startRun(['--which', 'deck'], silentCtx)
          .then(() => { statusMsg = 'stream-deck: started'; })
          .catch((e: unknown) => { statusMsg = `deck start failed: ${errMsg(e)}`; })
          .finally(() => { busy = false; });
      }
    }
  });

  // Start raw-mode input.
  startInput();

  // Initial poll before first render.
  await poll();

  // Render loop: poll every POLL_MS, re-render on each tick.
  try {
    while (running) {
      const frame = buildFrame(health, records, statusMsg, busy);
      const supStreams = health.find((h) => h.service === 'sup')?.streams;
      const full = supStreams
        ? [...frame, '', ...formatStreamLines(supStreams, { color: true })]
        : frame;
      render(full, { altScreen: true });

      // Sleep in short slices so keypresses wake the loop promptly.
      await sleep(POLL_MS);

      if (!running) break;
      await poll();
    }
  } finally {
    cleanup();
  }
}

// ---------------------------------------------------------------------------
// Frame builder
// ---------------------------------------------------------------------------

/** Terminal width for layout (clamped to a readable range). */
function termWidth(): number {
  return Math.min(Math.max(process.stdout.columns ?? 80, 60), 120);
}

function buildFrame(
  health: HealthResult[],
  records: ProcessRecord[],
  statusMsg: string,
  busy: boolean,
): string[] {
  const w = termWidth();
  const inner = w - 2; // chars strictly BETWEEN the ║ borders

  const lines: string[] = [];

  // Top border with title.
  lines.push('╔' + pad('═ cuesheet dashboard ', inner, '═') + '╗');

  // Column header — same layout helper as the data rows so columns line up.
  lines.push(boxLine(svcRow('', 'Service', 'Status', 'PID', 'Latency', 'Detail'), inner));
  lines.push('╟' + '─'.repeat(inner) + '╢');

  // Service rows.
  const byRole = new Map<Role, ProcessRecord>(records.map((r) => [r.role, r]));
  for (const h of health) {
    const rec   = byRole.get(h.service) ?? null;
    const state = serviceState(h.up, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[state];
    const pid   = rec ? String(rec.pid) : '—';
    const lat   = h.latencyMs !== null ? `${h.latencyMs} ms` : '—';
    const detail =
      state === 'starting' ? 'starting…'
      : !h.up && /unable to connect/i.test(h.detail) ? 'unreachable'
      : (h.detail ?? '');
    lines.push(boxLine(svcRow(glyph.symbol, SVC_LABELS[h.service], glyph.label, pid, lat, detail), inner));
  }

  // Deck row — synthesized from the tracked record (no HTTP health probe);
  // shared deckDisplay() keeps status / watch / gui in agreement.
  {
    const rec = byRole.get('deck') ?? null;
    const deck = deckDisplay(rec, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[deck.state];
    lines.push(boxLine(svcRow(glyph.symbol, SVC_LABELS.deck, glyph.label, deck.pid !== null ? String(deck.pid) : '—', '—', deck.detail), inner));
  }

  // Timestamp separator.
  const ts = new Date().toLocaleTimeString();
  lines.push('╟' + pad(` last updated: ${ts} ─ refreshing every ${POLL_MS / 1000}s `, inner, '─') + '╢');

  // Feedback line (only when there's a message).
  const fb = busy ? `⟳ ${statusMsg}` : statusMsg;
  if (fb) lines.push(boxLine(fb, inner));

  // Keybindings.
  lines.push(boxLine('[s] start   [x] stop   [r] restart   [d] deck   [q] quit', inner));

  // Bottom border.
  lines.push('╚' + '═'.repeat(inner) + '╝');

  return lines;
}

/** One interior box line: '║' + a leading space + body, clipped/padded to exactly `inner`. */
function boxLine(body: string, inner: number): string {
  const interior = ' ' + body;
  const fitted = interior.length > inner ? interior.slice(0, inner) : interior.padEnd(inner);
  return '║' + fitted + '║';
}

/**
 * Format one service-table row with FIXED column widths. The column header and
 * every data row go through this, so the columns always line up regardless of
 * label length (supervisor vs web-ui).
 */
function svcRow(sym: string, svc: string, status: string, pid: string, lat: string, detail: string): string {
  return (
    sym.padEnd(1) + ' ' +
    svc.padEnd(11) + ' ' +
    status.padEnd(6) + ' ' +
    pid.padEnd(8) + ' ' +
    lat.padStart(8) + '  ' +
    detail
  );
}

/** Right-pad `str` to `width` using `fill`, or truncate if already longer. */
function pad(str: string, width: number, fill: string): string {
  if (str.length >= width) return str.slice(0, width);
  return str + fill.repeat(width - str.length);
}

// ---------------------------------------------------------------------------
// Non-TTY fallback: one-shot plain text dump
// ---------------------------------------------------------------------------

async function nonTtyFallback(ctx: CommandContext): Promise<void> {
  const health  = await checkHealth();
  const records = procState.list(ctx.env);
  const byRole  = new Map<Role, ProcessRecord>(records.map((r) => [r.role, r]));

  const lines: string[] = ['', '  cuesheet status (non-interactive)', ''];
  for (const h of health) {
    const rec = byRole.get(h.service) ?? null;
    const state = serviceState(h.up, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[state];
    const pid = rec ? `pid=${rec.pid}` : 'not tracked';
    const detail = state === 'starting' ? 'starting… (warming up)' : h.detail;
    lines.push(`  ${glyph.symbol} ${SVC_LABELS[h.service]}  ${glyph.label}  ${pid}  ${detail}`);
  }
  {
    const rec = byRole.get('deck') ?? null;
    const deck = deckDisplay(rec, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[deck.state];
    lines.push(`  ${glyph.symbol} ${SVC_LABELS.deck}  ${glyph.label}  ${deck.pid !== null ? `pid=${deck.pid}` : 'not tracked'}  ${deck.detail}`);
  }
  const supStreams = health.find((h) => h.service === 'sup')?.streams;
  if (supStreams) {
    lines.push(...formatStreamLines(supStreams, { color: false }));
  }
  lines.push('');
  ctx.stdout.write(linesToString(lines) + '\n');

  // Genuinely down (no live process) → exit 1; warming up is not a failure.
  const anyDown = health.some((h) => {
    const rec = byRole.get(h.service) ?? null;
    return serviceState(h.up, rec !== null && procState.isLive(rec)) === 'down';
  });
  if (anyDown) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
