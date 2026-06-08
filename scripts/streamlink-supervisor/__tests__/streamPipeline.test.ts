import { EventEmitter } from 'events';
import { StreamPipeline } from '../streamPipeline';

interface FakeChild extends EventEmitter {
  pid: number | null;
  stdout: { pipe: jest.Mock; on: jest.Mock };
  stdin: { end: jest.Mock; on: jest.Mock };
  stderr: EventEmitter;
  kill: jest.Mock;
  __exit: (code: number | null, signal: string | null) => void;
}

function makeFakeChild(pid: number): FakeChild {
  const ee = new EventEmitter() as FakeChild;
  ee.pid = pid;
  // stdout/stdin carry an `on` so start() can attach 'error' handlers to the
  // streamlink→ffmpeg pipe (the EPIPE guard).
  ee.stdout = { pipe: jest.fn(), on: jest.fn() };
  ee.stdin = { end: jest.fn(), on: jest.fn() };
  ee.stderr = new EventEmitter();
  ee.kill = jest.fn(() => true);
  ee.__exit = (code, signal) => ee.emit('exit', code, signal);
  return ee;
}

function makeSpawn(children: FakeChild[]) {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  let i = 0;
  const fn = jest.fn((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    return children[i++];
  });
  return Object.assign(fn, { calls });
}

describe('StreamPipeline', () => {
  it('starts in pending status before start() is called', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://twitch.tv/team_alpha',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
    });
    expect(pipeline.status).toBe('pending');
  });

  it('start() spawns streamlink, then ffmpeg, and pipes streamlink.stdout into ffmpeg.stdin', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const spawn = makeSpawn([sl, ff]);
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://twitch.tv/team_alpha',
      port: 9001,
      spawn: spawn as any,
    });

    pipeline.start();

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(spawn.calls[0].cmd).toBe('streamlink');
    expect(spawn.calls[0].args).toContain('https://twitch.tv/team_alpha');
    expect(spawn.calls[1].cmd).toBe('ffmpeg');
    expect(spawn.calls[1].args).toContain('udp://127.0.0.1:9001?pkt_size=1316');
    expect(sl.stdout.pipe).toHaveBeenCalledWith(ff.stdin);
    expect(pipeline.status).toBe('running');
    expect(pipeline.pids).toEqual({ streamlink: 101, ffmpeg: 102 });
    expect(pipeline.obsInputUrl).toBe('udp://127.0.0.1:9001');
  });

  it('attaches error handlers to BOTH ends of the streamlink->ffmpeg pipe (EPIPE guard)', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
    });

    pipeline.start();

    // Without these, ffmpeg exiting mid-stream → EPIPE on ff.stdin → unhandled
    // error → the WHOLE supervisor crashes (all pipelines), not just this one.
    expect(ff.stdin.on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(sl.stdout.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('a child process "error" event drives onExit (respawn) instead of throwing', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const onExit = jest.fn();
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
      onExit,
    });

    pipeline.start();
    // An unhandled 'error' on an EventEmitter throws; the attached handler must
    // swallow it and route through the normal exit/respawn path.
    expect(() => ff.emit('error', new Error('EPIPE'))).not.toThrow();
    expect(pipeline.status).toBe('exited');
    expect(onExit).toHaveBeenCalledWith({ source: 'ffmpeg', code: null, signal: null });
  });

  it('honors STREAMLINK_QUALITY env as the gameday quality toggle', () => {
    const old = process.env.STREAMLINK_QUALITY;
    process.env.STREAMLINK_QUALITY = '720p60';
    try {
      const sl = makeFakeChild(101);
      const ff = makeFakeChild(102);
      const spawn = makeSpawn([sl, ff]);
      const pipeline = new StreamPipeline({
        streamId: 'team_alpha',
        upstreamUrl: 'https://twitch.tv/team_alpha',
        port: 9001,
        spawn: spawn as any,
      });
      pipeline.start();
      expect(spawn.calls[0].cmd).toBe('streamlink');
      expect(spawn.calls[0].args).toContain('720p60');
      expect(spawn.calls[0].args).not.toContain('best');
    } finally {
      if (old === undefined) delete process.env.STREAMLINK_QUALITY;
      else process.env.STREAMLINK_QUALITY = old;
    }
  });

  it('falls back to "best" when STREAMLINK_QUALITY is unset', () => {
    const old = process.env.STREAMLINK_QUALITY;
    delete process.env.STREAMLINK_QUALITY;
    try {
      const sl = makeFakeChild(101);
      const ff = makeFakeChild(102);
      const spawn = makeSpawn([sl, ff]);
      const pipeline = new StreamPipeline({
        streamId: 'team_alpha',
        upstreamUrl: 'https://twitch.tv/team_alpha',
        port: 9001,
        spawn: spawn as any,
      });
      pipeline.start();
      expect(spawn.calls[0].args).toContain('best');
    } finally {
      if (old !== undefined) process.env.STREAMLINK_QUALITY = old;
    }
  });

  it('when streamlink exits, ffmpeg is killed, status becomes exited, onExit fires with the upstream code', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const onExit = jest.fn();
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
      onExit,
    });

    pipeline.start();
    sl.__exit(0, null);

    expect(ff.kill).toHaveBeenCalled();
    expect(pipeline.status).toBe('exited');
    expect(onExit).toHaveBeenCalledWith({
      source: 'streamlink',
      code: 0,
      signal: null,
    });
  });

  it('when ffmpeg exits, streamlink is killed, status becomes exited, onExit fires', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const onExit = jest.fn();
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
      onExit,
    });

    pipeline.start();
    ff.__exit(1, 'SIGTERM');

    expect(sl.kill).toHaveBeenCalled();
    expect(pipeline.status).toBe('exited');
    expect(onExit).toHaveBeenCalledWith({
      source: 'ffmpeg',
      code: 1,
      signal: 'SIGTERM',
    });
  });

  it('onExit fires exactly once even if both children exit (e.g., cascading from one kill)', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const onExit = jest.fn();
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
      onExit,
    });

    pipeline.start();
    sl.__exit(0, null);
    ff.__exit(143, 'SIGTERM');

    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('stop() kills both children and transitions to exited', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
    });

    pipeline.start();
    pipeline.stop();

    expect(sl.kill).toHaveBeenCalled();
    expect(ff.kill).toHaveBeenCalled();
    expect(pipeline.status).toBe('exited');
  });

  it('forwards stderr from each child to onStderr tagged with the source', () => {
    const sl = makeFakeChild(101);
    const ff = makeFakeChild(102);
    const onStderr = jest.fn();
    const pipeline = new StreamPipeline({
      streamId: 'team_alpha',
      upstreamUrl: 'https://x',
      port: 9001,
      spawn: makeSpawn([sl, ff]) as any,
      onStderr,
    });

    pipeline.start();
    sl.stderr.emit('data', Buffer.from('streamlink warning\n'));
    ff.stderr.emit('data', Buffer.from('ffmpeg notice\n'));

    expect(onStderr).toHaveBeenCalledWith('streamlink', 'streamlink warning\n');
    expect(onStderr).toHaveBeenCalledWith('ffmpeg', 'ffmpeg notice\n');
  });
});
