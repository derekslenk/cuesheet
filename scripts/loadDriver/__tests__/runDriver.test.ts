import { runDriver } from '../runDriver';
import type { DriverDeps, DriverOptions } from '../runDriver';

const baseStreams = [
  { id: 1, name: 'A', team_name: 'T1', group_name: null },
  { id: 2, name: 'B', team_name: 'T2', group_name: null },
];

function happyFetch(latencyMs = 50): DriverDeps['fetchFn'] {
  return async () => {
    await new Promise(r => setTimeout(r, latencyMs));
    return { status: 200, body: '{"message":"ok"}' };
  };
}

function makeDeps(overrides: Partial<DriverDeps> = {}): DriverDeps {
  return {
    fetchFn: happyFetch(0),
    now: () => performance.now(),
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms),
    logger: { log: () => {}, warn: () => {} },
    ...overrides,
  };
}

const baseOpts: DriverOptions = {
  webuiUrl: 'http://test.invalid',
  streams: baseStreams,
  screens: ['large', 'left'],
  calls: 4,
  durationMs: 200,
};

describe('runDriver', () => {
  it('fires the requested number of setActive POSTs and returns a complete report', async () => {
    const calls: { url: string; body: string }[] = [];
    const deps = makeDeps({
      fetchFn: async (url, init) => {
        calls.push({ url, body: init.body });
        return { status: 200, body: '' };
      },
    });

    const report = await runDriver(baseOpts, deps);

    expect(calls).toHaveLength(4);
    expect(calls.every(c => c.url === 'http://test.invalid/api/setActive')).toBe(true);
    const parsedBodies = calls.map(c => JSON.parse(c.body));
    expect(parsedBodies[0]).toEqual({ screen: 'large', id: 1 });
    expect(parsedBodies[1]).toEqual({ screen: 'left', id: 2 });
    expect(parsedBodies[2]).toEqual({ screen: 'large', id: 1 });
    expect(parsedBodies[3]).toEqual({ screen: 'left', id: 2 });

    expect(report.totalCalls).toBe(4);
    expect(report.buckets.ok).toBe(4);
    expect(report.buckets.db_lock).toBe(0);
    expect(report.httpStats.count).toBe(4);
  });

  it('counts db_lock results separately from generic http_error', async () => {
    let i = 0;
    const responses = [
      { status: 200, body: '' },
      { status: 500, body: 'SQLITE_BUSY: database is locked' },
      { status: 500, body: 'some other 500' },
      { status: 200, body: '' },
    ];
    const deps = makeDeps({
      fetchFn: async () => responses[i++],
    });

    const report = await runDriver(baseOpts, deps);

    expect(report.buckets.ok).toBe(2);
    expect(report.buckets.db_lock).toBe(1);
    expect(report.buckets.http_error).toBe(1);
    expect(report.failures.length).toBe(2);
    expect(report.failures.some(f => f.bucket === 'db_lock')).toBe(true);
  });

  it('captures network errors when fetch throws', async () => {
    const deps = makeDeps({
      fetchFn: async () => {
        throw new Error('ECONNREFUSED 127.0.0.1:3000');
      },
    });

    const report = await runDriver(baseOpts, deps);

    expect(report.buckets.network_error).toBe(4);
    expect(report.buckets.ok).toBe(0);
    expect(report.failures[0].detail).toContain('ECONNREFUSED');
  });

  it('measures per-call latency and produces percentile stats', async () => {
    let mockTime = 0;
    const advance = (ms: number) => { mockTime += ms; };
    const latencies = [100, 200, 300, 400];
    let i = 0;
    const deps = makeDeps({
      now: () => mockTime,
      fetchFn: async () => {
        advance(latencies[i++]);
        return { status: 200, body: '' };
      },
      setTimeoutFn: (cb, _ms) => {
        // Fire immediately; we control time via `now`
        return setTimeout(cb, 0);
      },
    });

    const report = await runDriver(baseOpts, deps);

    expect(report.httpStats.count).toBe(4);
    expect(report.httpStats.min).toBe(100);
    expect(report.httpStats.max).toBe(400);
    expect(report.samples).toEqual([100, 200, 300, 400]);
  });

  it('respects calls=1 (degenerate case)', async () => {
    const deps = makeDeps();
    const report = await runDriver({ ...baseOpts, calls: 1 }, deps);
    expect(report.totalCalls).toBe(1);
    expect(report.httpStats.count).toBe(1);
  });

  it('records the run schedule (start/end wall-clock + actual elapsed)', async () => {
    const deps = makeDeps();
    const report = await runDriver(baseOpts, deps);
    expect(typeof report.startedAt).toBe('string');
    expect(typeof report.finishedAt).toBe('string');
    expect(report.elapsedMs).toBeGreaterThanOrEqual(0);
  });
});
