/**
 * Exit-code conventions for the `cuesheet` CLI. Every command should resolve to
 * one of these so callers (scripts, CI, the TUI) can react deterministically.
 *
 * Set `process.exitCode = EXIT.X` rather than calling `process.exit()` deep in
 * logic, so buffered stdout/stderr flush and the process unwinds cleanly.
 */
export const EXIT = {
  /** Success. */
  OK: 0,
  /** Generic/unexpected failure. */
  GENERIC: 1,
  /** Usage or flag parsing error. */
  USAGE: 2,
  /** A required external dependency is missing (streamlink/ffmpeg/next/node). */
  DEP_MISSING: 3,
  /** A required port is already in use. */
  PORT_IN_USE: 4,
} as const;

export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

/** Error carrying an explicit exit code; the router maps it to process.exitCode. */
export class CliError extends Error {
  readonly code: ExitCode;
  constructor(message: string, code: ExitCode = EXIT.GENERIC) {
    super(message);
    this.name = 'CliError';
    this.code = code;
  }
}
