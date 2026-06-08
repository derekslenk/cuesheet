/**
 * Minimal terminal render core for the `cuesheet` TUI.
 *
 * This module owns ONLY the low-level terminal primitives:
 *   - Screen rendering with minimal flicker (line-diff against last frame).
 *   - Raw-mode keyboard input via node:readline.
 *   - Guaranteed terminal restore on cleanup() / SIGINT / SIGTERM.
 *
 * Application logic (layout, state, keybindings) lives in gui.ts (T11).
 * No external or native deps — safe for `bun --compile`.
 */

import readline from 'node:readline';

// ---------------------------------------------------------------------------
// ANSI escape helpers
// ---------------------------------------------------------------------------

const ESC = '\x1b[';

/** Move cursor to top-left of the screen. */
const CURSOR_HOME = `${ESC}H`;
/** Hide the cursor. */
const CURSOR_HIDE = `${ESC}?25l`;
/** Show the cursor. */
const CURSOR_SHOW = `${ESC}?25h`;
/** Enter alternate screen buffer (saves scrollback). */
const ALT_SCREEN_ON = `${ESC}?1049h`;
/** Leave alternate screen buffer (restores scrollback). */
const ALT_SCREEN_OFF = `${ESC}?1049l`;
/** Erase from cursor to end of line. */
const ERASE_EOL = `${ESC}0K`;

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

/**
 * State kept between renders so we can diff against the previous frame and
 * only rewrite lines that changed.
 */
let _prevLines: string[] = [];
let _altScreen = false;

/**
 * Render a frame to stdout.
 *
 * Accepts either an array of line strings or a single string (split on `\n`).
 * Only changed lines are rewritten, minimising flicker on slow terminals.
 *
 * @param frame  Array of lines, or a newline-delimited string.
 * @param opts.altScreen  Enter the alternate screen buffer on first render
 *                        (default: false).  Once entered it stays until
 *                        cleanup() is called.
 */
export function render(
  frame: string[] | string,
  opts: { altScreen?: boolean } = {},
): void {
  const lines = Array.isArray(frame) ? frame : frame.split('\n');

  if (opts.altScreen && !_altScreen) {
    process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);
    _altScreen = true;
    _prevLines = [];
  }

  // Build the diff patch: cursor-home then rewrite only changed rows.
  let out = CURSOR_HOME;

  const rowCount = Math.max(lines.length, _prevLines.length);
  for (let i = 0; i < rowCount; i++) {
    const next = lines[i] ?? '';
    const prev = _prevLines[i] ?? '';
    if (next !== prev) {
      // Position cursor on row i (1-based), column 1.
      out += `${ESC}${i + 1};1H${next}${ERASE_EOL}`;
    }
  }

  if (out !== CURSOR_HOME) {
    process.stdout.write(out);
  }

  _prevLines = lines.slice();
}

/**
 * Force-redraw every line on the next `render()` call (e.g. after a
 * terminal resize event).
 */
export function invalidate(): void {
  _prevLines = [];
}

// ---------------------------------------------------------------------------
// Raw-mode keyboard input
// ---------------------------------------------------------------------------

export interface KeyEvent {
  /** The character string (may be empty for special keys). */
  str: string;
  /** Parsed key descriptor from readline, or null if unavailable. */
  key: readline.Key | null;
}

export type KeyHandler = (event: KeyEvent) => void;

let _keyHandler: KeyHandler | null = null;
let _rawActive = false;

/** Internal listener registered on process.stdin. */
function _onKeypress(str: string, key: readline.Key): void {
  if (_keyHandler) {
    _keyHandler({ str: str ?? '', key: key ?? null });
  }
}

/**
 * Register a callback for keypress events.  Replaces any existing handler.
 * Call {@link startInput} first to enable raw mode.
 */
export function onKey(handler: KeyHandler): void {
  _keyHandler = handler;
}

/**
 * Enable raw-mode keyboard input.  Must be called before keypresses are
 * delivered to the handler registered with {@link onKey}.
 *
 * Safe to call multiple times — no-ops if already active.
 */
export function startInput(): void {
  if (_rawActive) return;
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  process.stdin.on('keypress', _onKeypress);
  process.stdin.resume();
  _rawActive = true;
}

/**
 * Disable raw-mode keyboard input without fully cleaning up the terminal.
 * Prefer {@link cleanup} for full shutdown.
 */
export function stopInput(): void {
  if (!_rawActive) return;
  process.stdin.removeListener('keypress', _onKeypress);
  if (process.stdin.isTTY) {
    try { process.stdin.setRawMode(false); } catch { /* non-TTY in tests */ }
  }
  _rawActive = false;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

let _cleanedUp = false;

/**
 * Restore the terminal to a sane state.  Safe to call multiple times.
 *
 * - Disables raw mode.
 * - Shows the cursor.
 * - Leaves the alternate screen buffer if it was entered.
 *
 * Wire this into your exit path and signal handlers (see
 * {@link installSignalHandlers}).
 */
export function cleanup(): void {
  if (_cleanedUp) return;
  _cleanedUp = true;

  stopInput();

  let seq = CURSOR_SHOW;
  if (_altScreen) {
    seq += ALT_SCREEN_OFF;
    _altScreen = false;
  }
  try {
    process.stdout.write(seq);
  } catch { /* stdout already closed */ }

  _prevLines = [];
}

/**
 * Install SIGINT and SIGTERM handlers that call {@link cleanup} and then
 * re-exit with the appropriate code/signal so the shell sees the correct
 * exit status.
 *
 * Call once during app startup.  The installed handlers are additive (they
 * don't replace existing handlers).
 */
export function installSignalHandlers(): void {
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130); // 128 + SIGINT(2)
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143); // 128 + SIGTERM(15)
  });
}

// ---------------------------------------------------------------------------
// Utility: render lines to a plain string (for tests / non-TTY output)
// ---------------------------------------------------------------------------

/**
 * Serialise an array of lines to a plain string without writing to stdout.
 * Useful for unit tests and for printing a snapshot when stdout is not a TTY.
 */
export function linesToString(lines: string[]): string {
  return lines.join('\n');
}
