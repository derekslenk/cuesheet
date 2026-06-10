/**
 * Managed process records: the source of truth for processes `cuesheet start`
 * has launched and `cuesheet stop` must terminate.
 *
 * State lives in a single run-state.json (path from {@link runStatePath}). The
 * file is written ATOMICALLY (temp file in the same dir + rename) under a
 * best-effort lock so concurrent start/stop invocations never corrupt it
 * (R10/AC8). Before any kill, process identity is verified by OS creation time
 * (with image-name fallback), so a reused PID is treated as STALE rather than
 * killing an unrelated process (R4/AC6/AC7). The cmdFingerprint on each record
 * is stored for diagnostics only.
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
 * Persist state to a temp file in the SAME directory (so rename is atomic on the
 * same filesystem) then rename over the target. Does NOT touch the lock — the
 * caller MUST already hold it (write() / withLockedState()).
 */
function writeUnlocked(state: RunState, env: NodeJS.ProcessEnv): void {
  const file = runStatePath(env);
  const dir = dataDir(env);
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
}

/**
 * Atomically persist run-state.json under a best-effort O_EXCL lock.
 *
 * Prefer {@link withLockedState} for read-modify-write: a bare write() only
 * locks the persist, not a preceding read(), so two concurrent processes doing
 * read()+write() could lose an update.
 */
export function write(state: RunState, env: NodeJS.ProcessEnv = process.env): void {
  ensureStateDirs(env);
  const release = acquireLock(dataDir(env));
  try {
    writeUnlocked(state, env);
  } finally {
    release();
  }
}

/**
 * Run a read → mutate → persist transaction with the lock held for the WHOLE
 * duration, so concurrent start/stop processes can't clobber each other's
 * records (e.g. parallel `start --which sup` and `start --which web`). The
 * mutator receives the freshly-read state and mutates it in place.
 */
function withLockedState<T>(env: NodeJS.ProcessEnv, fn: (state: RunState) => T): T {
  ensureStateDirs(env);
  const release = acquireLock(dataDir(env));
  try {
    const state = read(env);
    const result = fn(state);
    writeUnlocked(state, env);
    return result;
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
      sleepSync(5);
    }
  }
}

/**
 * Block the current thread for `ms` WITHOUT spinning the CPU. `Atomics.wait` on
 * a private SharedArrayBuffer parks the thread (allowed on the main thread in
 * Node/Bun), so start/stop stay synchronous without burning a core.
 */
function sleepSync(ms: number): void {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Stable fingerprint of how a process was launched (argv + cwd). Stored on the
 * record for diagnostics/forensics only. PID-reuse protection is the OS
 * creation-time check in {@link isSafeToKill}, not this fingerprint.
 */
export function makeFingerprint(argv: readonly string[], cwd: string): string {
  const payload = JSON.stringify({ argv, cwd });
  return crypto.createHash('sha256').update(payload).digest('hex').slice(0, 16);
}

/** Add (or replace, by role) a record under a single locked transaction. */
export function add(record: ProcessRecord, env: NodeJS.ProcessEnv = process.env): void {
  withLockedState(env, (state) => {
    state.processes = state.processes.filter((p) => p.role !== record.role);
    state.processes.push(record);
  });
}

/** Remove the record for a role (if any) under a single locked transaction. */
export function remove(role: Role, env: NodeJS.ProcessEnv = process.env): void {
  withLockedState(env, (state) => {
    state.processes = state.processes.filter((p) => p.role !== role);
  });
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
 * Whether the recorded pid currently exists (LIVENESS ONLY).
 *
 * This is `process.kill(pid, 0)` plus a structural check that the record has its
 * identity fields. It does NOT prove the live pid is still OUR process — a
 * recycled pid would also report live here. Use {@link isSafeToKill} before
 * terminating anything; isLive is for "is this slot occupied" decisions
 * (skip-if-running, reconcile) where killing is not involved.
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

// A live process is the SAME instance we recorded iff its OS creation time is
// within this window of the recorded startTime. Generous enough for spawn /
// registration latency + clock-source jitter; far tighter than any realistic
// pid reuse (a recycled pid is created minutes/hours later).
const START_TIME_TOLERANCE_MS = 10_000;

export interface IsSafeToKillDeps {
  /** Live process OS creation time in unix ms, or null if unreadable. */
  startTimeMs?: (pid: number) => number | null;
  /** Whether the live pid's image/command matches our runtime basename. */
  imageMatches?: (pid: number) => boolean;
}

/**
 * IDENTITY guard: is the live pid the SAME process instance we recorded, rather
 * than an unrelated process that reused the pid? `stop` and the supervisor guard
 * call this before killing, so a recycled pid can never take down a stranger
 * (the failure mode this design replaced mon-stop.ps1 to avoid).
 *
 * Primary signal — process CREATION TIME: a recycled pid has a wildly different
 * creation time, while the genuine process matches `record.startTime` within a
 * small tolerance. This is runtime-AGNOSTIC, so it works when the daemon runs as
 * tsx `node.exe` but is managed by the compiled `cuesheet.exe` (the case the old
 * `basename(process.execPath)` image match broke on). When the creation time
 * can't be read, it falls back to that best-effort image match (same-runtime
 * only). Returns false if neither can verify — conservative: don't kill.
 */
export function isSafeToKill(record: ProcessRecord, deps: IsSafeToKillDeps = {}): boolean {
  if (!isLive(record)) return false;
  const recorded = Date.parse(record.startTime);
  const liveStart = (deps.startTimeMs ?? processStartTimeMs)(record.pid);
  if (liveStart !== null && Number.isFinite(recorded)) {
    return Math.abs(liveStart - recorded) <= START_TIME_TOLERANCE_MS;
  }
  // Couldn't read the creation time → best-effort image match (same-runtime).
  return (deps.imageMatches ?? liveImageMatches)(record.pid);
}

/**
 * Live process OS creation time in unix ms, or null if unreadable.
 * win32: PowerShell `Get-Process .StartTime`. Other platforms return null so the
 * caller falls back to the image match (daemons there run same-runtime).
 */
// Milliseconds between the Windows FILETIME epoch (1601-01-01 UTC) and the unix
// epoch (1970-01-01 UTC).
const FILETIME_TO_UNIX_MS = 11_644_473_600_000;

export function processStartTimeMs(pid: number): number | null {
  if (process.platform !== 'win32') return null;
  try {
    // ToFileTimeUtc() is an unambiguous 100ns tick count since 1601 UTC — no
    // locale/timezone parsing (the cause of an earlier 4h-off bug). It correctly
    // accounts for StartTime's local Kind.
    const out = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `try { (Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc() } catch { 'NA' }`,
      ],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    if (!/^\d+$/.test(out)) return null;
    return Math.round(Number(out) / 10_000 - FILETIME_TO_UNIX_MS);
  } catch {
    return null;
  }
}

/** Best-effort: does the live pid's image/command contain our runtime basename? */
function liveImageMatches(pid: number): boolean {
  const self = path.basename(process.execPath).toLowerCase();
  if (!self) return false;
  try {
    if (process.platform === 'win32') {
      const out = execFileSync(
        'tasklist',
        ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
        { stdio: ['ignore', 'pipe', 'ignore'] },
      )
        .toString()
        .toLowerCase();
      return out.includes(self);
    }
    // POSIX: prefer /proc (Linux); fall back to `ps` (macOS).
    let cmd: string;
    try {
      cmd = fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8').replace(/\0/g, ' ');
    } catch {
      cmd = execFileSync('ps', ['-p', String(pid), '-o', 'command='], {
        stdio: ['ignore', 'pipe', 'ignore'],
      }).toString();
    }
    return cmd.toLowerCase().includes(self);
  } catch {
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
  sleepSync(400);
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
  return withLockedState(env, (state) => {
    const live: ProcessRecord[] = [];
    const removed: ProcessRecord[] = [];
    for (const rec of state.processes) {
      if (isLive(rec)) live.push(rec);
      else removed.push(rec);
    }
    state.processes = live;
    return removed;
  });
}

/** All recorded processes that are still live (after no mutation). */
export function listLive(env: NodeJS.ProcessEnv = process.env): ProcessRecord[] {
  return read(env).processes.filter((p) => isLive(p));
}
