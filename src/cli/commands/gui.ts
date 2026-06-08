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
import { checkHealth, serviceState, STATE_GLYPH } from '../lib/health.js';
import * as procState from '../lib/procState.js';
import { run as startRun } from './start.js';
import { run as stopRun } from './stop.js';
import { consoleLogger } from '../lib/log.js';
import type { CommandContext, HealthResult, ProcessRecord, Role } from '../lib/types.js';

/** Poll interval in milliseconds. */
const POLL_MS = 2000;

/** Service display labels. */
const SVC_LABELS: Record<Role, string> = { sup: 'supervisor', web: 'web-ui   ' };

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
  const silentCtx: CommandContext = {
    ...ctx,
    stdout: process.stderr, // discard to stderr in case something leaks
    stderr: process.stderr,
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
    // Ctrl-C or q → quit
    if ((key?.ctrl && key.name === 'c') || str === 'q' || str === 'Q') {
      running = false;
      return;
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
      render(frame, { altScreen: true });

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
  const inner = w - 2; // inside the border characters

  const lines: string[] = [];

  // Top border
  lines.push('╔' + pad('═ cuesheet dashboard ', inner, '═') + '╗');

  // Header row
  lines.push('║  ' + 'Service      Status   PID      Latency   Detail'.padEnd(inner - 2) + ' ║');
  lines.push('║  ' + ('─'.repeat(inner - 2)) + ' ║');

  // Service rows
  const byRole = new Map<Role, ProcessRecord>(records.map((r) => [r.role, r]));

  for (const h of health) {
    const rec   = byRole.get(h.service) ?? null;
    const state = serviceState(h.up, rec !== null && procState.isLive(rec));
    const glyph = STATE_GLYPH[state];
    const sym   = glyph.symbol;
    const label = SVC_LABELS[h.service];
    const st    = glyph.label.padEnd(5);
    const pid   = rec ? String(rec.pid).padEnd(8) : '—       ';
    const lat   = h.latencyMs !== null ? `${h.latencyMs} ms`.padStart(7) : '      —';
    const det   = (state === 'starting' ? 'starting… (warming up)' : (h.detail ?? '')).slice(0, 30);
    const row   = `${sym} ${label} ${st}  ${pid} ${lat}   ${det}`;
    lines.push('║  ' + row.padEnd(inner - 2) + ' ║');
  }

  // Separator + timestamp
  const ts    = new Date().toLocaleTimeString();
  const tsStr = ` last updated: ${ts} ─ refreshing every ${POLL_MS / 1000}s `;
  lines.push('╟' + pad(tsStr, inner, '─') + '║');

  // Status/feedback line
  const fbStr = busy ? `  ⟳ ${statusMsg}` : (statusMsg ? `  ${statusMsg}` : '');
  if (fbStr) {
    lines.push('║' + fbStr.padEnd(inner) + '║');
  }

  // Keybinding hint
  const hint = '  [s] start  [x] stop  [r] restart  [q] quit';
  lines.push('║' + hint.padEnd(inner) + '║');

  // Bottom border
  lines.push('╚' + '═'.repeat(inner) + '╝');

  return lines;
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
