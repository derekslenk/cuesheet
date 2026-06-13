import { acquireLock, DeckLockHeldError, processAlive } from '../singleInstance.js'
import { existsSync, readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const freshLockPath = () => join(mkdtempSync(join(tmpdir(), 'deck-lock-')), 'cuesheet-deck.lock')

describe('acquireLock', () => {
  it('creates the lock and records our pid, then release removes it', () => {
    const path = freshLockPath()
    const release = acquireLock(path, { pid: 4242, now: 111 })
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ pid: 4242, startTime: 111 })
    release()
    expect(existsSync(path)).toBe(false)
  })

  it('refuses when a live foreign deck holds the lock', () => {
    const path = freshLockPath()
    writeFileSync(path, JSON.stringify({ pid: 9999, startTime: 1 }))
    expect(() => acquireLock(path, { pid: 4242, isAlive: () => true })).toThrow(DeckLockHeldError)
  })

  it('steals a stale lock whose holder is dead', () => {
    const path = freshLockPath()
    writeFileSync(path, JSON.stringify({ pid: 9999, startTime: 1 }))
    const release = acquireLock(path, { pid: 4242, now: 222, isAlive: () => false })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ pid: 4242, startTime: 222 })
    release()
  })

  it('steals a corrupt lock file', () => {
    const path = freshLockPath()
    writeFileSync(path, 'not json{')
    const release = acquireLock(path, { pid: 4242, now: 333, isAlive: () => true })
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual({ pid: 4242, startTime: 333 })
    release()
  })

  it('release does not delete a lock another process has since taken', () => {
    const path = freshLockPath()
    const release = acquireLock(path, { pid: 4242, now: 1 })
    // another deck takes over
    writeFileSync(path, JSON.stringify({ pid: 5555, startTime: 2 }))
    release()
    expect(existsSync(path)).toBe(true)
    expect(JSON.parse(readFileSync(path, 'utf8')).pid).toBe(5555)
    rmSync(path, { force: true })
  })

  it('processAlive reports true for the current process', () => {
    expect(processAlive(process.pid)).toBe(true)
  })
})
