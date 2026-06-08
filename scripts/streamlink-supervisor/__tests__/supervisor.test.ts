import { EventEmitter } from 'events';
import { Supervisor } from '../supervisor';
import { RestartTracker } from '../restartTracker';
import { PortAllocator } from '../portAllocator';

interface FakeChild extends EventEmitter {
  pid: number | null;
  stdout: { pipe: jest.Mock; on: jest.Mock };
  stdin: { end: jest.Mock; on: jest.Mock };
  stderr: EventEmitter;
  kill: jest.Mock;
  __exit: (code: number | null, signal: string | null) => void;
}

function fakeChild(pid: number): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = pid;
  ee.stdout = { pipe: jest.fn(), on: jest.fn() };
  ee.stdin = { end: jest.fn(), on: jest.fn() };
  ee.stderr = new EventEmitter();
  ee.kill = jest.fn(() => true);
  ee.__exit = (code, signal) => ee.emit('exit', code, signal);
  return ee;
}

function makeSupervisor(children: FakeChild[]) {
  let i = 0;
  const spawn = jest.fn(() => children[i++]) as unknown as Supervisor['spawn'];
  const pending: Array<() => void> = [];
  const enqueue = (fn: () => void) => pending.push(fn);
  const flush = () => {
    const queue = pending.splice(0);
    queue.forEach(fn => fn());
  };
  const supervisor = new Supervisor({
    spawn,
    enqueue,
    ports: new PortAllocator({ basePort: 9001, max: 8 }),
    tracker: new RestartTracker({ windowMs: 30_000, max: 3 }),
  });
  return { supervisor, spawn, flush };
}

describe('Supervisor', () => {
  it('start() allocates a port and launches a pipeline for the stream', () => {
    const sl = fakeChild(101);
    const ff = fakeChild(102);
    const { supervisor, spawn } = makeSupervisor([sl, ff]);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://twitch.tv/team_alpha' });

    expect(spawn).toHaveBeenCalledTimes(2);
    const state = supervisor.get('team_alpha');
    expect(state).toMatchObject({
      streamId: 'team_alpha',
      port: 9001,
      status: 'running',
      restartCount: 0,
      obsInputUrl: 'udp://127.0.0.1:9001',
    });
  });

  it('list() exposes every supervised stream as a serializable snapshot', () => {
    const children = [fakeChild(11), fakeChild(12), fakeChild(21), fakeChild(22)];
    const { supervisor } = makeSupervisor(children);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://x/a' });
    supervisor.start({ streamId: 'team_beta', upstreamUrl: 'https://x/b' });

    const list = supervisor.list();
    expect(list.map(s => s.streamId).sort()).toEqual(['team_alpha', 'team_beta']);
    expect(list[0]).toEqual(
      expect.objectContaining({
        streamId: expect.any(String),
        port: expect.any(Number),
        status: expect.any(String),
        restartCount: expect.any(Number),
        obsInputUrl: expect.any(String),
      })
    );
  });

  it('respawns the pipeline on exit (status flips back to running, restartCount increments)', () => {
    const c1 = fakeChild(101);
    const c2 = fakeChild(102);
    const c3 = fakeChild(103);
    const c4 = fakeChild(104);
    const { supervisor, flush } = makeSupervisor([c1, c2, c3, c4]);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://x' });
    c1.__exit(1, null);
    flush();

    const state = supervisor.get('team_alpha');
    expect(state!.status).toBe('running');
    expect(state!.restartCount).toBe(1);
  });

  it('escalates the stream after 3 restarts in the window — stops respawning', () => {
    const children = Array.from({ length: 10 }, (_, i) => fakeChild(100 + i));
    const { supervisor, spawn, flush } = makeSupervisor(children);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://x' });
    // 1st exit → respawn
    children[0].__exit(1, null);
    flush();
    // 2nd exit → respawn
    children[2].__exit(1, null);
    flush();
    // 3rd exit → escalate (no respawn)
    children[4].__exit(1, null);
    flush();

    const state = supervisor.get('team_alpha');
    expect(state!.status).toBe('escalated');
    // 3 starts × 2 spawns each = 6 total; no 4th start should have happened
    expect(spawn).toHaveBeenCalledTimes(6);
  });

  it('stop() tears down a single stream and releases its port', () => {
    const c1 = fakeChild(101);
    const c2 = fakeChild(102);
    const c3 = fakeChild(201);
    const c4 = fakeChild(202);
    const { supervisor } = makeSupervisor([c1, c2, c3, c4]);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://x' });
    supervisor.stop('team_alpha');

    expect(c1.kill).toHaveBeenCalled();
    expect(c2.kill).toHaveBeenCalled();
    expect(supervisor.get('team_alpha')).toBeUndefined();

    // port freed → next start should reuse 9001
    supervisor.start({ streamId: 'team_beta', upstreamUrl: 'https://y' });
    expect(supervisor.get('team_beta')!.port).toBe(9001);
  });

  it('stopAll() tears down every supervised stream', () => {
    const children = [fakeChild(11), fakeChild(12), fakeChild(21), fakeChild(22)];
    const { supervisor } = makeSupervisor(children);

    supervisor.start({ streamId: 'team_alpha', upstreamUrl: 'https://a' });
    supervisor.start({ streamId: 'team_beta', upstreamUrl: 'https://b' });

    supervisor.stopAll();
    expect(supervisor.list()).toEqual([]);
    children.forEach(c => expect(c.kill).toHaveBeenCalled());
  });
});
