import { startRuntime } from '../runtime';

// Minimal spawn stub: returns a fake child that never exits, so pipelines stay
// "running" and the runtime doesn't try to spawn real streamlink/ffmpeg.
function fakeSpawn() {
  const child: any = {
    stdout: { on: () => {} },
    stderr: { on: () => {} },
    on: () => {},
    kill: () => {},
    killed: false,
    pid: 1234,
  };
  return child;
}

describe('startRuntime control closures', () => {
  const tableName = 'streams_2026_summer_sat';

  function makeDb(rows: any[]) {
    const run = jest.fn().mockResolvedValue(undefined);
    const db = {
      all: jest.fn().mockImplementation(async (sql: string, ...params: unknown[]) => {
        if (sql.includes('WHERE obs_source_name = ?')) {
          return rows.filter(r => r.obs_source_name === params[0]);
        }
        return rows;
      }),
      run,
    };
    return { db, run };
  }

  it('onStop writes disabled=1 then stops the stream; unknown id => false', async () => {
    const rows = [{ id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 }];
    const { db, run } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test', manageSingleton: false,
    });

    const ok = await (rt as any).onStop('team_a');
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      `UPDATE ${tableName} SET disabled = 1 WHERE obs_source_name = ?`, 'team_a'
    );
    expect(rt.supervisor.list().map(s => s.streamId)).not.toContain('team_a');

    const missing = await (rt as any).onStop('ghost');
    expect(missing).toBe(false);

    await rt.shutdown();
  });

  it('onStart writes disabled=0 then starts the stream', async () => {
    const rows = [{ id: 2, obs_source_name: 'team_b', url: 'https://twitch.tv/b', disabled: 1 }];
    const { db, run } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test', manageSingleton: false,
    });
    // disabled=1 → not supervised at boot
    expect(rt.supervisor.list().map(s => s.streamId)).not.toContain('team_b');

    const ok = await (rt as any).onStart('team_b');
    expect(ok).toBe(true);
    expect(run).toHaveBeenCalledWith(
      `UPDATE ${tableName} SET disabled = 0 WHERE obs_source_name = ?`, 'team_b'
    );
    expect(rt.supervisor.list().map(s => s.streamId)).toContain('team_b');

    await rt.shutdown();
  });

  it('onRestartCrashed restarts escalated streams only; running + stopped are untouched', async () => {
    const rows = [
      { id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 },
      { id: 2, obs_source_name: 'team_b', url: 'https://twitch.tv/b', disabled: 0 },
      { id: 3, obs_source_name: 'team_off', url: 'https://twitch.tv/off', disabled: 1 },
    ];
    const { db } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test', manageSingleton: false,
    });

    // team_off is disabled → never supervised. Force team_b into the escalated
    // state the crash-loop guard would set; team_a stays running.
    rt.supervisor.get('team_b')!.status = 'escalated';
    const aRestartsBefore = rt.supervisor.get('team_a')!.restartCount;

    const result = rt.onRestartCrashed();

    expect(result.restarted).toEqual(['team_b']);
    // team_b recovered to running with a bumped restart count
    expect(rt.supervisor.get('team_b')!.status).toBe('running');
    expect(rt.supervisor.get('team_b')!.restartCount).toBe(1);
    // team_a untouched
    expect(rt.supervisor.get('team_a')!.status).toBe('running');
    expect(rt.supervisor.get('team_a')!.restartCount).toBe(aRestartsBefore);
    // team_off never entered supervision
    expect(rt.supervisor.list().map(s => s.streamId)).not.toContain('team_off');

    await rt.shutdown();
  });

  it('onRestartCrashed is a no-op (empty result) when nothing is escalated', async () => {
    const rows = [{ id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 }];
    const { db } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test', manageSingleton: false,
    });

    const result = rt.onRestartCrashed();
    expect(result.restarted).toEqual([]);
    expect(rt.supervisor.get('team_a')!.restartCount).toBe(0);

    await rt.shutdown();
  });

  it('listAll merges DB rows with live status; stopped rows get relayPort + status=stopped', async () => {
    const rows = [
      { id: 1, obs_source_name: 'team_a', url: 'https://twitch.tv/a', disabled: 0 },
      { id: 9, obs_source_name: 'team_off', url: 'https://twitch.tv/off', disabled: 1 },
    ];
    const { db } = makeDb(rows);
    const rt = await startRuntime({
      db, tableName, spawn: fakeSpawn as never,
      ports: { basePort: 9001, max: 8 }, healthPort: 0, logDir: './logs/test', manageSingleton: false,
    });
    const list = await (rt as any).listAll();
    const off = list.find((s: any) => s.streamId === 'team_off');
    expect(off.status).toBe('stopped');
    expect(off.disabled).toBe(1);
    const a = list.find((s: any) => s.streamId === 'team_a');
    expect(a.status).toBe('running');
    await rt.shutdown();
  });
});
