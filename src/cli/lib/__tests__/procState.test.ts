import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runStatePath } from '../paths';
import {
  read,
  write,
  add,
  remove,
  get,
  list,
  listLive,
  isLive,
  isSafeToKill,
  reconcile,
  makeFingerprint,
  killRecord,
} from '../procState';
import type { ProcessRecord } from '../types';

/** Build a temp CUESHEET_HOME env for an isolated state dir per test. */
function tmpEnv(): NodeJS.ProcessEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-proc-'));
  return { CUESHEET_HOME: dir } as unknown as NodeJS.ProcessEnv;
}

function record(over: Partial<ProcessRecord> = {}): ProcessRecord {
  return {
    role: 'sup',
    pid: process.pid, // this test process — guaranteed alive
    startTime: new Date().toISOString(),
    cmdFingerprint: makeFingerprint(['node', 'sup'], '/work'),
    ports: [8080],
    logPath: '/tmp/sup.log',
    ...over,
  };
}

describe('isSafeToKill (identity guard)', () => {
  it('safe when the live process creation time matches the recorded startTime', () => {
    const r = record();
    // Within tolerance, regardless of runtime image → fixes cross-runtime stop.
    const startTimeMs = (_pid: number) => Date.parse(r.startTime) + 500;
    expect(isSafeToKill(r, { startTimeMs, imageMatches: () => false })).toBe(true);
  });

  it('NOT safe when the creation time is far off (pid reused) — even if the image matches', () => {
    const r = record();
    const startTimeMs = (_pid: number) => Date.parse(r.startTime) + 60 * 60 * 1000; // 1h later
    // Decisive: a recycled pid has a wildly different creation time → refuse,
    // even though the runtime image would match.
    expect(isSafeToKill(r, { startTimeMs, imageMatches: () => true })).toBe(false);
  });

  it('falls back to the image match when the creation time is unavailable', () => {
    const r = record();
    expect(isSafeToKill(r, { startTimeMs: () => null, imageMatches: () => true })).toBe(true);
    expect(isSafeToKill(r, { startTimeMs: () => null, imageMatches: () => false })).toBe(false);
  });

  it('is false for a dead pid', () => {
    expect(isSafeToKill(record({ pid: 2 ** 31 - 1 }))).toBe(false);
  });

  it('is false for a structurally stale record (missing identity fields)', () => {
    expect(isSafeToKill(record({ startTime: '', cmdFingerprint: '' }))).toBe(false);
  });
});

describe('procState read/write basics', () => {
  it('returns empty state when the file is missing', () => {
    const env = tmpEnv();
    expect(read(env)).toEqual({ version: 1, processes: [] });
  });

  it('returns empty state when the file is corrupt', () => {
    const env = tmpEnv();
    const file = runStatePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, '{ this is not json');
    expect(read(env)).toEqual({ version: 1, processes: [] });
  });

  it('round-trips a written state and produces valid JSON on disk', () => {
    const env = tmpEnv();
    const rec = record();
    write({ version: 1, processes: [rec] }, env);
    const raw = fs.readFileSync(runStatePath(env), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(read(env).processes).toHaveLength(1);
    expect(read(env).processes[0]).toEqual(rec);
  });

  it('add replaces by role; remove/get/list behave', () => {
    const env = tmpEnv();
    add(record({ role: 'sup', pid: 11 }), env);
    add(record({ role: 'web', pid: 22 }), env);
    expect(list(env)).toHaveLength(2);
    // replace sup
    add(record({ role: 'sup', pid: 33 }), env);
    expect(list(env)).toHaveLength(2);
    expect(get('sup', env)?.pid).toBe(33);
    remove('sup', env);
    expect(get('sup', env)).toBeUndefined();
    expect(list(env)).toHaveLength(1);
  });
});

describe('procState atomic concurrent writes (R10/AC8)', () => {
  it('keeps run-state.json valid JSON with no lost records under concurrency', async () => {
    const env = tmpEnv();
    const roles: Array<ProcessRecord['role']> = ['sup', 'web'];
    // Fire many concurrent add() calls. add() is read-modify-write, so the
    // lock must serialize them. We assert the file is always valid JSON and the
    // final state contains exactly one record per role (last-writer-wins).
    const N = 40;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        Promise.resolve().then(() =>
          add(record({ role: roles[i % 2], pid: 1000 + i }), env),
        ),
      ),
    );
    const raw = fs.readFileSync(runStatePath(env), 'utf8');
    expect(() => JSON.parse(raw)).not.toThrow();
    const state = read(env);
    // Exactly one record per role survives; never garbled or duplicated.
    const seen = state.processes.map((p) => p.role).sort();
    expect(seen).toEqual(['sup', 'web']);
  });
});

describe('procState staleness + reconcile (R4/AC6/AC7)', () => {
  it('reports a dead pid as not-live', () => {
    // PID that is overwhelmingly unlikely to exist.
    const dead = record({ pid: 2 ** 31 - 1 });
    expect(isLive(dead)).toBe(false);
  });

  it('reports a structurally-incomplete record as not-live', () => {
    expect(isLive(record({ startTime: '' }))).toBe(false);
    expect(isLive(record({ cmdFingerprint: '' }))).toBe(false);
    expect(isLive(record({ pid: 0 }))).toBe(false);
  });

  it('reports the live test process as live', () => {
    expect(isLive(record({ pid: process.pid }))).toBe(true);
  });

  it('reconcile removes a stale record WITHOUT killing anything', () => {
    const env = tmpEnv();
    const stale = record({ role: 'sup', pid: 2 ** 31 - 1 });
    const live = record({ role: 'web', pid: process.pid });
    write({ version: 1, processes: [stale, live] }, env);

    // Guard: reconcile must not invoke killRecord. Spy via a kill counter.
    const killSpy = jest.spyOn(process, 'kill');
    const removed = reconcile(env);

    // It may call process.kill(pid, 0) for liveness checks, but NEVER with a
    // termination signal.
    for (const call of killSpy.mock.calls) {
      const sig = call[1];
      expect(sig === 0 || sig === undefined).toBe(true);
    }
    killSpy.mockRestore();

    expect(removed).toHaveLength(1);
    expect(removed[0].pid).toBe(stale.pid);
    expect(get('sup', env)).toBeUndefined();
    expect(get('web', env)?.pid).toBe(process.pid);
    expect(listLive(env)).toHaveLength(1);
  });

  it('killRecord on an already-dead pid is a graceful no-op returning true', () => {
    const dead = record({ pid: 2 ** 31 - 1 });
    expect(killRecord(dead)).toBe(true);
  });
});

describe('makeFingerprint', () => {
  it('is stable for the same argv+cwd and differs otherwise', () => {
    const a = makeFingerprint(['node', 'sup', '--port', '8080'], '/work');
    const b = makeFingerprint(['node', 'sup', '--port', '8080'], '/work');
    const c = makeFingerprint(['node', 'sup', '--port', '9090'], '/work');
    const d = makeFingerprint(['node', 'sup', '--port', '8080'], '/other');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });
});
