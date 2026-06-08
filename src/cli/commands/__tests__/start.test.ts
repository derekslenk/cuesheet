/**
 * Tests for `cuesheet start`.
 *
 * We avoid actually launching `next dev` / the supervisor (slow, port-binding,
 * environment-dependent). Instead we exercise the decision logic:
 *   AC11: a port that is already bound makes start fail with exit code 4
 *         (PORT_IN_USE) and records NOTHING.
 *   - an already-live tracked record is skipped (idempotent), not double-started.
 *   - an invalid --which is a usage error.
 */
import net from 'node:net';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as procState from '../../lib/procState';
import { EXIT } from '../../lib/exit';
import { run as start, computeReexecArgs } from '../start';
import type { CommandContext, ProcessRecord } from '../../lib/types';

function tmpEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-start-'));
  return { ...process.env, CUESHEET_HOME: dir, ...extra } as unknown as NodeJS.ProcessEnv;
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

/** Bind a free ephemeral port and return its number + a closer. */
function bindEphemeral(): Promise<{ port: number; close: () => void }> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.listen(0, '0.0.0.0', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      resolve({ port, close: () => srv.close() });
    });
  });
}

function liveRecord(role: ProcessRecord['role']): ProcessRecord {
  return {
    role,
    pid: process.pid, // the test process — guaranteed live
    startTime: new Date().toISOString(),
    cmdFingerprint: procState.makeFingerprint([process.execPath, role], '/work'),
    ports: role === 'sup' ? [8080] : [3000],
    logPath: '/tmp/x.log',
  };
}

describe('cuesheet start', () => {
  afterEach(() => { process.exitCode = 0; });

  it('AC11: fails with PORT_IN_USE (4) when the web port is already bound, recording nothing', async () => {
    const { port, close } = await bindEphemeral();
    try {
      // Point the web service at the bound port via PORT.
      const env = tmpEnv({ PORT: String(port) });
      const { ctx } = makeCtx(env);

      await expect(start(['--which', 'web'], ctx)).rejects.toMatchObject({
        code: EXIT.PORT_IN_USE,
      });

      // Nothing was recorded because the launch never happened.
      expect(procState.get('web', env)).toBeUndefined();
    } finally {
      close();
    }
  });

  it('skips a service whose tracked record is already live (idempotent)', async () => {
    // Use a high, almost-certainly-free supervisor health/base port so the
    // port pre-check would pass — but the live record should short-circuit
    // before any spawn. We assert no NEW record/pid replaced ours.
    const env = tmpEnv({
      SUPERVISOR_HEALTH_PORT: '58080',
      SUPERVISOR_BASE_PORT: '59001',
    });
    procState.add(liveRecord('sup'), env);

    const { ctx, logs } = makeCtx(env);
    await start(['--which', 'sup'], ctx);

    // The record is unchanged (still our pid) — nothing was spawned/replaced.
    expect(procState.get('sup', env)?.pid).toBe(process.pid);
    expect(logs.some((l) => /already running/i.test(l))).toBe(true);
  });

  it('rejects an invalid --which with a usage error', async () => {
    const env = tmpEnv();
    const { ctx } = makeCtx(env);
    await expect(start(['--which', 'bogus'], ctx)).rejects.toMatchObject({
      code: EXIT.USAGE,
    });
  });
});

describe('computeReexecArgs (compiled-vs-interpreter re-exec)', () => {
  // Regression: in a `bun --compile` binary, process.argv[1] is a VIRTUAL bun
  // path (B:/~BUN/root/... or /$bunfs/root/...) that is NOT execPath. The old
  // `argv1 !== execPath` check forwarded that virtual path, so the child ran
  // `cuesheet <virtual-path> sup` → "unknown command" → instant death.

  it('compiled Windows binary: passes ONLY the subcommand', () => {
    expect(
      computeReexecArgs('C:\\app\\dist\\cuesheet.exe', 'B:/~BUN/root/cuesheet.exe', 'sup'),
    ).toEqual(['sup']);
  });

  it('compiled POSIX binary: passes ONLY the subcommand', () => {
    expect(
      computeReexecArgs('/opt/app/dist/cuesheet', '/$bunfs/root/cuesheet', 'dev'),
    ).toEqual(['dev']);
  });

  it('bun run (dev): forwards the real entry script', () => {
    expect(
      computeReexecArgs('C:\\Users\\x\\scoop\\apps\\bun\\bun.exe', 'C:/proj/src/cli/main.ts', 'sup'),
    ).toEqual(['C:/proj/src/cli/main.ts', 'sup']);
  });

  it('node/tsx (dev): forwards the real entry script', () => {
    expect(computeReexecArgs('/usr/bin/node', '/proj/src/cli/main.ts', 'dev')).toEqual([
      '/proj/src/cli/main.ts',
      'dev',
    ]);
  });

  it('falls back to subcommand-only when there is no argv1', () => {
    expect(computeReexecArgs('/usr/bin/bun', undefined, 'sup')).toEqual(['sup']);
  });
});
