import net from 'node:net';
import {
  ensureSoleSupervisor,
  releaseSupervisorRecord,
  defaultWaitPortFree,
  SupervisorTakeoverRefusedError,
  SupervisorPortBusyError,
  type SupervisorGuardDeps,
} from '../supervisorGuard';
import type { ProcessRecord } from '../../../src/cli/lib/types';

function listenEphemeral(host = '127.0.0.1'): Promise<net.Server> {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, host, () => resolve(s));
  });
}
const portOf = (s: net.Server) => (s.address() as net.AddressInfo).port;
const close = (s: net.Server) => new Promise<void>((r) => s.close(() => r()));

const SELF = process.pid;

const rec = (over: Partial<ProcessRecord> = {}): ProcessRecord => ({
  role: 'sup',
  pid: SELF + 1,
  startTime: '2026-06-09T00:00:00.000Z',
  cmdFingerprint: 'fp',
  ports: [8080, 9001],
  logPath: '',
  ...over,
});

function makeDeps(over: Partial<SupervisorGuardDeps> = {}): jest.Mocked<SupervisorGuardDeps> {
  return {
    get: jest.fn().mockReturnValue(undefined),
    isLive: jest.fn().mockReturnValue(true),
    isSafeToKill: jest.fn().mockReturnValue(true),
    killRecord: jest.fn().mockReturnValue(true),
    add: jest.fn(),
    remove: jest.fn(),
    makeFingerprint: jest.fn().mockReturnValue('fp'),
    waitPortFree: jest.fn().mockResolvedValue(true),
    pid: jest.fn().mockReturnValue(SELF),
    now: jest.fn().mockReturnValue('2026-06-09T00:00:00.000Z'),
    ...over,
  } as jest.Mocked<SupervisorGuardDeps>;
}

const baseOpts = { env: {} as NodeJS.ProcessEnv, cwd: '/x', healthPort: 8080, ports: [8080, 9001] };

describe('ensureSoleSupervisor', () => {
  it('registers itself when no supervisor is recorded', async () => {
    const deps = makeDeps();
    const res = await ensureSoleSupervisor(baseOpts, deps);
    expect(res.action).toBe('registered');
    expect(deps.killRecord).not.toHaveBeenCalled();
    expect(deps.add).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'sup', pid: SELF, ports: [8080, 9001] }),
      baseOpts.env,
    );
  });

  it('takes over a live, safe-to-kill stale supervisor then registers itself', async () => {
    const existing = rec({ pid: SELF + 5 });
    const deps = makeDeps({ get: jest.fn().mockReturnValue(existing) });
    const res = await ensureSoleSupervisor(baseOpts, deps);
    expect(deps.killRecord).toHaveBeenCalledWith(existing);
    expect(deps.remove).toHaveBeenCalledWith('sup', baseOpts.env);
    expect(deps.waitPortFree).toHaveBeenCalledWith(8080, expect.any(String), expect.any(Number));
    expect(deps.add).toHaveBeenCalledWith(expect.objectContaining({ pid: SELF }), baseOpts.env);
    expect(res).toEqual({ action: 'tookover', pid: SELF + 5 });
  });

  it('refuses (throws) when a live record is NOT safe to kill — never kills a stranger', async () => {
    const existing = rec({ pid: SELF + 5 });
    const deps = makeDeps({
      get: jest.fn().mockReturnValue(existing),
      isSafeToKill: jest.fn().mockReturnValue(false),
    });
    await expect(ensureSoleSupervisor(baseOpts, deps)).rejects.toBeInstanceOf(
      SupervisorTakeoverRefusedError,
    );
    expect(deps.killRecord).not.toHaveBeenCalled();
    expect(deps.remove).not.toHaveBeenCalled();
    expect(deps.add).not.toHaveBeenCalled();
  });

  it('clears a dead/stale record and registers without killing', async () => {
    const existing = rec({ pid: SELF + 5 });
    const deps = makeDeps({
      get: jest.fn().mockReturnValue(existing),
      isLive: jest.fn().mockReturnValue(false),
    });
    const res = await ensureSoleSupervisor(baseOpts, deps);
    expect(deps.killRecord).not.toHaveBeenCalled();
    expect(deps.remove).toHaveBeenCalledWith('sup', baseOpts.env);
    expect(deps.add).toHaveBeenCalled();
    expect(res.action).toBe('registered');
  });

  it('skips when already tracked as this pid (cuesheet start owns the record + its logPath)', async () => {
    const mine = rec({ pid: SELF, logPath: 'C:/logs/sup.log' });
    const deps = makeDeps({ get: jest.fn().mockReturnValue(mine) });
    const res = await ensureSoleSupervisor(baseOpts, deps);
    expect(deps.killRecord).not.toHaveBeenCalled();
    expect(deps.add).not.toHaveBeenCalled();
    expect(res.action).toBe('skipped');
  });

  it('is disabled by SUPERVISOR_PORT_GUARD=off (no procState touched)', async () => {
    const deps = makeDeps();
    const res = await ensureSoleSupervisor(
      { ...baseOpts, env: { ...process.env, SUPERVISOR_PORT_GUARD: 'off' } },
      deps,
    );
    expect(res.action).toBe('disabled');
    expect(deps.get).not.toHaveBeenCalled();
    expect(deps.add).not.toHaveBeenCalled();
  });

  it('throws SupervisorPortBusyError if the port never frees after takeover', async () => {
    const existing = rec({ pid: SELF + 5 });
    const deps = makeDeps({
      get: jest.fn().mockReturnValue(existing),
      waitPortFree: jest.fn().mockResolvedValue(false),
    });
    await expect(ensureSoleSupervisor(baseOpts, deps)).rejects.toBeInstanceOf(
      SupervisorPortBusyError,
    );
    expect(deps.killRecord).toHaveBeenCalled();
  });
});

describe('releaseSupervisorRecord', () => {
  it('removes the record when it points at this process', () => {
    const get = jest.fn().mockReturnValue(rec({ pid: SELF }));
    const remove = jest.fn();
    expect(releaseSupervisorRecord({} as NodeJS.ProcessEnv, { get, remove, pid: () => SELF })).toBe(true);
    expect(remove).toHaveBeenCalledWith('sup', expect.anything());
  });

  it('does NOT remove a successor record (different pid)', () => {
    const get = jest.fn().mockReturnValue(rec({ pid: SELF + 9 }));
    const remove = jest.fn();
    expect(releaseSupervisorRecord({} as NodeJS.ProcessEnv, { get, remove, pid: () => SELF })).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('is a no-op when there is no record', () => {
    const get = jest.fn().mockReturnValue(undefined);
    const remove = jest.fn();
    expect(releaseSupervisorRecord({} as NodeJS.ProcessEnv, { get, remove, pid: () => SELF })).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('defaultWaitPortFree', () => {
  it('resolves true when the port is free', async () => {
    const s = await listenEphemeral();
    const port = portOf(s);
    await close(s); // release it
    await expect(defaultWaitPortFree(port, '127.0.0.1', 1000)).resolves.toBe(true);
  });

  it('resolves false when the port stays held past the timeout', async () => {
    const s = await listenEphemeral();
    const port = portOf(s);
    try {
      await expect(defaultWaitPortFree(port, '127.0.0.1', 300)).resolves.toBe(false);
    } finally {
      await close(s);
    }
  });
});
