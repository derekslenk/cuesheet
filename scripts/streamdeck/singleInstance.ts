// Deck-vs-deck single-instance guard via a self-contained lockfile holding {pid,startTime}.
// Reuses pid-liveness as the identity primitive (a pragmatic stand-in for procState's
// creation-time check) without touching the CLI's closed Role/Which unions.
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname } from 'node:path'

export interface LockInfo {
  pid: number
  startTime: number
}

export class DeckLockHeldError extends Error {
  readonly holder: LockInfo
  constructor(holder: LockInfo) {
    super(`Another cuesheet deck is already running (pid ${holder.pid}). Refusing to start a second.`)
    this.name = 'DeckLockHeldError'
    this.holder = holder
  }
}

/** Default liveness probe: signal 0 tests existence; EPERM means it exists but is not ours. */
export function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (err) {
    return (err as NodeJS.ErrnoException)?.code === 'EPERM'
  }
}

export interface AcquireOptions {
  pid?: number
  now?: number
  isAlive?: (pid: number) => boolean
}

/**
 * Acquire the deck lock. Steals a stale lock (holder process dead / file corrupt).
 * Throws DeckLockHeldError if a live foreign deck owns it.
 * Returns a release function (idempotent; only removes the file if we still own it).
 */
export function acquireLock(lockPath: string, opts: AcquireOptions = {}): () => void {
  const pid = opts.pid ?? process.pid
  const now = opts.now ?? Date.now()
  const isAlive = opts.isAlive ?? processAlive

  mkdirSync(dirname(lockPath), { recursive: true })

  if (existsSync(lockPath)) {
    try {
      const info = JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo
      if (info?.pid && info.pid !== pid && isAlive(info.pid)) {
        throw new DeckLockHeldError(info)
      }
      // else: our own pid, or a dead holder -> safe to steal
    } catch (err) {
      if (err instanceof DeckLockHeldError) throw err
      // corrupt/unreadable lock -> treat as stale and steal
    }
  }

  writeFileSync(lockPath, JSON.stringify({ pid, startTime: now } satisfies LockInfo))

  let released = false
  return () => {
    if (released) return
    released = true
    try {
      const info = JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo
      if (info.pid === pid) rmSync(lockPath, { force: true })
    } catch {
      // already gone / unreadable -> nothing to do
    }
  }
}
