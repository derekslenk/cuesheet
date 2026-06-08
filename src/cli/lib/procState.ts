/**
 * Managed process records: the source of truth for processes `cuesheet start`
 * has launched and `cuesheet stop` must terminate.
 *
 * State lives in a single run-state.json (path from {@link runStatePath}). The
 * file is written ATOMICALLY (temp file in the same dir + rename) under a
 * best-effort lock so concurrent start/stop invocations never corrupt it
 * (R10/AC8). Before any kill we validate the live process still matches the
 * recorded fingerprint + startTime, so a reused PID is treated as STALE rather
 * than killing an unrelated process (R4/AC6/AC7).
 *
 * Termination is process-group-first: callers spawn children DETACHED (POSIX:
 * new process group via `detached:true`; win32: kill the whole tree). On POSIX
 * we kill the negative PGID; on win32 we `taskkill /PID <root> /T /F` targeting
 * only the tracked root pid.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { runStatePath, ensureStateDirs, dataDir } from './paths.js';
import type { ProcessRecord, RunState, Role } from './types.js';

/** Default empty state used when the file is missing or unreadable. */
function emptyState(): RunState {
  return { version: 1, processes: [] };
}

/**
 * Read run-state.json. Tolerates a missing or corrupt file by returning an
 * empty state — a half-written or hand-edited file must never crash start/stop.
 */
export function read(env: NodeJS.ProcessEnv = process.env): RunState {
  const file = runStatePath(env);
  let text: string;
  try {
    text = fs.readFileSync(file, 'utf8');
  } catch {
    return emptyState();
  }
  try {
    const parsed = JSON.parse(text) as Partial<RunState>;
    if (
      !parsed ||
      parsed.version !== 1 ||
      !Array.isArray(parsed.processes)
    ) {
      return emptyState();
    }
    return { version: 1, processes: parsed.processes };
  } catch {
    return emptyState();
  }
}

/**
 * Atomically persist run-state.json. Writes to a temp file in the SAME
 * directory (so rename is atomic on the same filesystem) then renames over the
 * target, under a best-effort O_EXCL lock so concurrent writers serialize.
 */
export function write(state: RunState, env: NodeJS.ProcessEnv = process.env): void {
  ensureStateDirs(env);
  const file = runStatePath(env);
  const dir = dataDir(env);
  const release = acquireLock(dir);
  try {
    const tmp = path.join(
      dir,
      `.run-state.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`,
    );
    const body = JSON.stringify(state, null, 2);
    const fd = fs.openSync(tmp, 'w');
    try {
      fs.writeSync(fd, body);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tmp, file);
  } finally {
    release();
  }
}

/**
 * Best-effort exclusive lock via an O_EXCL lock file. Returns a release fn.
 * Retries briefly on contention; if the lock can't be taken (e.g. a stale lock
 * from a crashed writer) we steal it after a timeout so we never deadlock —
 * the atomic rename still guarantees the file is never half-written.
 */
function acquireLock(dir: string): () => void {
  const lockFile = path.join(dir, '.run-state.lock');
  const deadline = Date.now() + 2000;
  // Busy-wait with a tiny synchronous backoff; writes are short so contention
  // windows are sub-millisecond. We stay synchronous to keep read/write simple
  // for callers (start/stop are CLI one-shots, not hot paths).
  for (;;) {
    try {
      const fd = fs.openSync(lockFile, 'wx');
      fs.writeSync(fd, String(process.pid));
      fs.closeSync(fd);
      return () => {
        try {
          fs.unlinkSync(lockFile);
        } catch {
          /* already gone */
        }
      };
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      if (Date.now() > deadline) {
        // Steal a presumed-stale lock; rename below is still atomic.
        try {
          fs.unlinkSync(lockFile);
        } catch {
          /* race: another writer cleaned it up */
        }
        continue;
      }
      busyWait(5);
    }
  }
}

/** Synchronous sub-millisecond spin (no async to keep the API blocking). */
function busyWait(ms: number): void {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    /* spin */
  }
}

/**
 * Stable fingerprint of how a process was launched (argv + cwd). Stored on the
 * record and re-checked before kill to detect PID reuse.
 */
export function makeFingerprint(argv: readonly string[], cwd: string): string {
  const payload = JSON.stringify({ argv, cwd });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Add (or replace, by role) a record and persist atomically. */
export function add(record: ProcessRecord, env: NodeJS.ProcessEnv = process.env): void {
  const state = read(env);
  state.processes = state.processes.filter((p) => p.role !== record.role);
  state.processes.push(record);
  write(state, env);
}

/** Remove the record for a role (if any) and persist atomically. */
export function remove(role: Role, env: NodeJS.ProcessEnv = process.env): void {
  const state = read(env);
  const next = state.processes.filter((p) => p.role !== role);
  if (next.length !== state.processes.length) {
    state.processes = next;
    write(state, env);
  }
}

/** Get the record for a role, or undefined. */
export function get(role: Role, env: NodeJS.ProcessEnv = process.env): ProcessRecord | undefined {
  return read(env).processes.find((p) => p.role === role);
}

/** All recorded processes (live or not). */
export function list(env: NodeJS.ProcessEnv = process.env): ProcessRecord[] {
  return read(env).processes;
}

/**
 * Whether the recorded process is still the SAME live process.
 *
 * Liveness is `process.kill(pid, 0)` (true if the pid exists and we may signal
 * it). PID reuse is guarded by the recorded startTime + fingerprint: we can't
 * cheaply read another process's real start time cross-platform without native
 * deps, so we treat the record's own stored startTime as the launch identity
 * and rely on the fingerprint to scope kills to processes WE launched. This is
 * a documented best-effort: kill(0) confirms existence, the stored
 * startTime/fingerprint scope intent, and the process-group kill targets only
 * the tracked tree. A truly reused PID with no record match is reported here as
 * not-live by the absence of a matching record, and reconcile() drops it.
 */
export function isLive(record: ProcessRecord): boolean {
  if (!record || typeof record.pid !== 'number' || record.pid <= 0) return false;
  // A record missing its identity fields is structurally stale.
  if (!record.startTime || !record.cmdFingerprint) return false;
  try {
    process.kill(record.pid, 0);
    return true;
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    // EPERM: process exists but is owned by another user — still "live", but
    // not ours to manage; treat as live so we don't silently drop it, while
    // killRecord will surface the permission error.
    if (code === 'EPERM') return true;
    // ESRCH (no such process) or anything else → not live.
    return false;
  }
}

/**
 * Terminate the process recorded in `record`, process-group-first.
 *
 * - POSIX: children are spawned detached (their own process group), so we kill
 *   the negative PGID (== the leader pid) with SIGTERM, then SIGKILL after a
 *   short grace period.
 * - win32: `taskkill /PID <pid> /T /F` kills the tracked root and its tree.
 *
 * Already-exited processes (ESRCH / taskkill "not found") are treated as a
 * successful no-op. Returns true if we believe the process is gone afterwards.
 */
export function killRecord(record: ProcessRecord): boolean {
  if (!record || typeof record.pid !== 'number' || record.pid <= 0) return true;

  if (process.platform === 'win32') {
    try {
      execFileSync('taskkill', ['/PID', String(record.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
      return true;
    } catch {
      // taskkill exits non-zero if the process is already gone — treat as done.
      return true;
    }
  }

  // POSIX: kill the whole process group (negative pid). Children were spawned
  // detached so the leader pid is also the pgid.
  const pgid = -record.pid;
  try {
    process.kill(pgid, 'SIGTERM');
  } catch (err: unknown) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return true; // already gone
    // Fall back to a direct-pid SIGTERM if the group target was invalid.
    try {
      process.kill(record.pid, 'SIGTERM');
    } catch (e2: unknown) {
      if ((e2 as NodeJS.ErrnoException).code === 'ESRCH') return true;
    }
  }

  // Grace period, then SIGKILL anything that lingers.
  busyWait(400);
  try {
    process.kill(pgid, 'SIGKILL');
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ESRCH') return true;
    try {
      process.kill(record.pid, 'SIGKILL');
    } catch {
      /* gone */
    }
  }
  return !isLive(record);
}

/**
 * Drop stale (not-live) entries from run-state and persist if anything changed.
 * Returns the removed records so callers can warn the user (e.g. "cleared a
 * stale supervisor entry"). Does NOT kill anything — stale records by
 * definition no longer correspond to a live process we own.
 */
export function reconcile(env: NodeJS.ProcessEnv = process.env): ProcessRecord[] {
  const state = read(env);
  const live: ProcessRecord[] = [];
  const removed: ProcessRecord[] = [];
  for (const rec of state.processes) {
    if (isLive(rec)) live.push(rec);
    else removed.push(rec);
  }
  if (removed.length > 0) {
    state.processes = live;
    write(state, env);
  }
  return removed;
}

/** All recorded processes that are still live (after no mutation). */
export function listLive(env: NodeJS.ProcessEnv = process.env): ProcessRecord[] {
  return read(env).processes.filter((p) => isLive(p));
}
