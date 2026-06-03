import { EventEmitter } from 'events';
import { Server } from 'http';
import { startRuntime } from '../runtime';

function fakeChild(pid: number) {
  const ee = new EventEmitter() as any;
  ee.pid = pid;
  ee.stdout = { pipe: jest.fn() };
  ee.stdin = { end: jest.fn() };
  ee.stderr = new EventEmitter();
  ee.kill = jest.fn(() => true);
  return ee;
}

describe('startRuntime', () => {
  function makeDeps(rows: Array<{ id: number; obs_source_name: string; url: string }>) {
    const children = Array.from({ length: rows.length * 4 }, (_, i) => fakeChild(100 + i));
    let i = 0;
    return {
      db: { all: jest.fn().mockResolvedValue(rows) },
      tableName: 'streams_2026_summer_sat',
      spawn: jest.fn(() => children[i++]) as any,
      ports: { basePort: 9001, max: 8 },
      healthPort: 0, // ephemeral
      logDir: '/tmp/sup-test-runtime',
    };
  }

  it('loads streams from the DB and starts the supervisor + health server', async () => {
    const deps = makeDeps([
      { id: 1, obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/a' },
      { id: 2, obs_source_name: 'team_beta_main',  url: 'https://twitch.tv/b' },
    ]);

    const runtime = await startRuntime(deps);

    expect(deps.db.all).toHaveBeenCalledWith(expect.stringContaining(deps.tableName));
    expect(runtime.supervisor.list().map(s => s.streamId).sort()).toEqual([
      'team_alpha_main',
      'team_beta_main',
    ]);
    expect(runtime.server).toBeInstanceOf(Server);

    await runtime.shutdown();
    expect(runtime.supervisor.list()).toEqual([]);
  });

  it('shutdown() is idempotent', async () => {
    const deps = makeDeps([
      { id: 1, obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/a' },
    ]);
    const runtime = await startRuntime(deps);
    await runtime.shutdown();
    await expect(runtime.shutdown()).resolves.toBeUndefined();
  });

  it('starts cleanly with zero streams (cold start before any team is configured)', async () => {
    const deps = makeDeps([]);
    const runtime = await startRuntime(deps);
    expect(runtime.supervisor.list()).toEqual([]);
    await runtime.shutdown();
  });
});
