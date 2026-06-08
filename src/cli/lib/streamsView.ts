/**
 * Shared rendering for the supervised-stream list, used by status, watch, and
 * gui so all three present streams identically (compact one line per stream,
 * health-colored, with a running-count header).
 *
 * Data comes from the supervisor's /health (lib/health.ts attaches it to the
 * `sup` HealthResult). Pure formatting — no I/O.
 */
import type { StreamStatus } from './types.js';

const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  dim: '\x1b[2m',
} as const;

export interface StreamSummary {
  running: number;
  total: number;
  allRunning: boolean;
}

export function summarizeStreams(streams: StreamStatus[]): StreamSummary {
  const total = streams.length;
  const running = streams.filter((s) => s.status === 'running').length;
  return { running, total, allRunning: total > 0 && running === total };
}

/** Per-row health: ok (running, no restarts) | warn (running but restarted) | bad. */
type RowState = 'ok' | 'warn' | 'bad';
function rowState(s: StreamStatus): RowState {
  if (s.status !== 'running') return 'bad';
  if (s.restartCount > 0) return 'warn';
  return 'ok';
}

function paint(state: RowState, text: string, color: boolean): string {
  if (!color) return text;
  const c = state === 'bad' ? C.red : state === 'warn' ? C.yellow : C.green;
  return `${c}${text}${C.reset}`;
}

function clip(s: string, width: number): string {
  return s.length > width ? s.slice(0, width - 1) + '…' : s.padEnd(width);
}

/**
 * Compact, indented lines for the stream list (header + one line per stream).
 * When `color` is true, rows are tinted by health (red = not running, yellow =
 * running-but-restarted, green = clean). Pass `color: false` for non-TTY output.
 */
export function formatStreamLines(
  streams: StreamStatus[],
  opts: { color?: boolean } = {},
): string[] {
  const color = opts.color ?? false;
  if (streams.length === 0) {
    return ['  streams: none supervised'];
  }

  const { running, total, allRunning } = summarizeStreams(streams);
  const header = paint(
    allRunning ? 'ok' : 'bad',
    `streams: ${running}/${total} running`,
    color,
  );

  const lines = ['  ' + header];
  for (const s of streams) {
    const st = rowState(s);
    const sym = st === 'bad' ? '✗' : st === 'warn' ? '!' : '✓';
    const id = clip(s.streamId, 22);
    const status = clip(s.status, 9);
    const restarts = `r=${s.restartCount}`.padEnd(5);
    lines.push(paint(st, `  ${sym} ${id} ${status} ${restarts} ${s.obsInputUrl}`, color));
  }
  return lines;
}
