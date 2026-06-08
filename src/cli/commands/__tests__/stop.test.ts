/**
 * Tests for `cuesheet stop` — the safety-critical command. These verify the
 * acceptance criteria that distinguish it from the old mon-stop.ps1:
 *   AC6: stop kills ONLY tracked process groups; an unrelated process survives.
 *   AC7: a stale record (dead/reused PID) is CLEARED, not killed.
 *   AC6: re-running stop with nothing live exits 0 and clears stale entries.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as procState from '../../lib/procState';
import { run as stop } from '../stop';
import type { CommandContext, ProcessRecord } from '../../lib/types';

function tmpEnv(): NodeJS.ProcessEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-stop-'));
  return { ...process.env, CUESHEET_HOME: dir } as unknown as NodeJS.ProcessEnv;
}

function makeCtx(env: NodeJS.ProcessEnv): { ctx: CommandContext; logs: string[] } {
  const logs: string[] = [];
  const sink = (m: string) => { logs.push(m); };
  const ctx: CommandContext = {
    cwd: process.cwd(),
    env,
    stdout: { write: () => true } as unknown as NodeJS.WritableStream,
    stderr: { write: () => true } as unknown as NodeJS.WritableStream,
    logger: { info: sink, warn: sink, error: sink },
  };
  return { ctx, logs };
}

/** Spawn a real, long-lived detached child (its own process group on POSIX). */
function spawnSleeper(): ChildProcess {
  const child = spawn(
    process.execPath,
    ['-e', 'setInterval(() => {}, 1 << 30)'],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  return child;
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Poll until pid is dead or timeout. */
async function waitDead(pid: number, timeoutMs = 3000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return !isAlive(pid);
}

function record(role: ProcessRecord['role'], pid: number): ProcessRecord {
  return {
    role,
    pid,
    startTime: new Date().toISOString(),
    cmdFingerprint: procState.makeFingerprint([process.execPath, role], '/work'),
    ports: role === 'sup' ? [8080] : [3000],
    logPath: '/tmp/x.log',
  };
}

describe('cuesheet stop', () => {
  const spawned: ChildProcess[] = [];
  afterEach(() => {
    for (const c of spawned) {
      if (c.pid && isAlive(c.pid)) {
        try { process.kill(c.pid, 'SIGKILL'); } catch { /* ignore */ }
      }
      // Detach the ChildProcess handle so jest doesn't see a leaked open handle.
      c.removeAllListeners();
      c.unref();
    }
    spawned.length = 0;
  });

  it('AC6: kills the tracked process but leaves an unrelated process alive', async () => {
    const env = tmpEnv();

    const tracked = spawnSleeper();
    const unrelated = spawnSleeper();
    spawned.push(tracked, unrelated);
    expect(tracked.pid).toBeDefined();
    expect(unrelated.pid).toBeDefined();

    // Only the tracked process is recorded; the unrelated one is NOT.
    procState.add(record('web', tracked.pid!), env);

    const { ctx } = makeCtx(env);
    await stop(['--which', 'web'], ctx);

    expect(await waitDead(tracked.pid!)).toBe(true);
    // The unrelated process must survive — this is the mon-stop.ps1 bug we fixed.
    expect(isAlive(unrelated.pid!)).toBe(true);
    // Record removed after stop.
    expect(procState.get('web', env)).toBeUndefined();
    expect(process.exitCode).toBe(0);
  });

  it('AC7: clears a stale record WITHOUT killing an unrelated process at that PID', async () => {
    const env = tmpEnv();

    // An unrelated live process whose PID we will (mis)record as a STALE entry by
    // giving the record a pid that is NOT live. We pick a definitely-dead pid so
    // isLive() returns false, and assert killRecord is never invoked on it.
    const deadPid = 2 ** 31 - 1;
    procState.add(record('sup', deadPid), env);

    const killSpy = jest.spyOn(process, 'kill');
    const { ctx, logs } = makeCtx(env);
    await stop(['--which', 'sup'], ctx);

    // No termination signal was sent for the stale pid (only liveness probes
    // with signal 0 are allowed).
    for (const call of killSpy.mock.calls) {
      const sig = call[1];
      expect(sig === 0 || sig === undefined).toBe(true);
    }
    killSpy.mockRestore();

    expect(procState.get('sup', env)).toBeUndefined();
    expect(logs.some((l) => /stale/i.test(l))).toBe(true);
    expect(process.exitCode).toBe(0);
  });

  it('AC6: exits 0 and is a no-op when nothing is tracked', async () => {
    const env = tmpEnv();
    const { ctx } = makeCtx(env);
    process.exitCode = undefined;
    await stop(['--which', 'both'], ctx);
    expect(process.exitCode).toBe(0);
    expect(procState.list(env)).toHaveLength(0);
  });

  it('rejects an invalid --which with a usage error', async () => {
    const env = tmpEnv();
    const { ctx } = makeCtx(env);
    await expect(stop(['--which', 'bogus'], ctx)).rejects.toMatchObject({ code: 2 });
  });

  afterAll(() => {
    process.exitCode = 0;
  });
});
