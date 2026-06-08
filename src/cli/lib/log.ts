/**
 * Per-process logging for detached `cuesheet start` children.
 *
 * When `start` launches dev/supervisor detached, the children have no console
 * attached, so their stdout/stderr are redirected into a per-role log file
 * here. `status --logs`, `watch`, and `gui` tail these files.
 */
import fs from 'node:fs';
import { logPathFor, ensureDir, logDir } from './paths.js';
import type { Logger } from './types.js';

/**
 * Open (create/truncate) a per-role log file and return its path plus a file
 * descriptor suitable for passing to child_process stdio:
 *
 *   const { logPath, fd } = openProcessLog('sup');
 *   spawn(cmd, args, { detached: true, stdio: ['ignore', fd, fd] });
 */
export function openProcessLog(
  role: string,
  env: NodeJS.ProcessEnv = process.env,
): { logPath: string; fd: number } {
  ensureDir(logDir(env));
  const logPath = logPathFor(role, env);
  // 'a' = append so successive starts accumulate; callers can write a banner.
  const fd = fs.openSync(logPath, 'a');
  return { logPath, fd };
}

/** Write a structured, timestamped banner line to an open log fd. */
export function writeLogLine(fd: number, line: string): void {
  fs.writeSync(fd, `[${new Date().toISOString()}] ${line}\n`);
}

/** Read the last `n` lines of a log file (for status --logs / gui). */
export function tailLog(logPath: string, n = 20): string[] {
  try {
    const text = fs.readFileSync(logPath, 'utf8');
    const lines = text.split(/\r?\n/);
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    return lines.slice(-n);
  } catch {
    return [];
  }
}

/** Default console-backed logger used when a command isn't given one. */
export const consoleLogger: Logger = {
  info: (m) => console.log(m),
  warn: (m) => console.warn(m),
  error: (m) => console.error(m),
};
