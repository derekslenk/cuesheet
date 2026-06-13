/**
 * Shared contracts for the `cuesheet` CLI.
 *
 * These types are the stable interface every command and lib module imports.
 * Keep this file dependency-free (no node: imports beyond types) so it can be
 * consumed from any layer without pulling runtime deps.
 */

/** Logical service/process the CLI manages. */
export type Role = 'web' | 'sup' | 'deck';

/** Which services a start/stop/restart action targets. */
export type Which = 'both' | 'sup' | 'web' | 'deck';

/**
 * Execution context threaded into every command's `run()`. Lets commands be
 * unit-tested with injected streams/env/cwd instead of touching globals.
 */
export interface CommandContext {
  /** Working directory the command should resolve relative paths against. */
  cwd: string;
  /** Environment to read config from (defaults to process.env). */
  env: NodeJS.ProcessEnv;
  /** Output streams. */
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
  /** Structured logger; defaults to a console-backed logger. */
  logger: Logger;
}

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * A managed process record persisted to run-state.json. Records are written
 * atomically and validated against the live process (via {@link cmdFingerprint}
 * + {@link startTime}) before any kill, so PID reuse never kills the wrong
 * process.
 */
export interface ProcessRecord {
  role: Role;
  pid: number;
  /** ISO timestamp the process was launched (PID-reuse guard). */
  startTime: string;
  /** Stable fingerprint of argv + cwd used to detect stale/reused PIDs. */
  cmdFingerprint: string;
  /** Ports the process is expected to own (e.g. [3000] or [8080]). */
  ports: number[];
  /** Absolute path to the per-process log file. */
  logPath: string;
}

/** Shape of run-state.json. */
export interface RunState {
  version: 1;
  processes: ProcessRecord[];
}

/** One supervised stream, as reported by the supervisor's /health endpoint. */
export interface StreamStatus {
  streamId: string;
  status: string; // 'running' | 'starting' | 'escalated' | ...
  restartCount: number;
  obsInputUrl: string;
}

/** Health snapshot for a single service (used by status/watch/gui). */
export interface HealthResult {
  service: Role;
  url: string;
  up: boolean;
  detail: string;
  latencyMs: number | null;
  /** Supervised streams (supervisor only; parsed from /health when up). */
  streams?: StreamStatus[];
}

/** A resolved config value plus where it came from (for `doctor`). */
export interface ResolvedValue {
  value: string | undefined;
  source: 'flag' | 'env' | '.env.local' | 'default' | 'PATH' | 'unset';
}
