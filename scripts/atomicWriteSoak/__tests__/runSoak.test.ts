import { runSoak, defaultReadFile } from '../runSoak';
import type { SoakDeps, SoakOptions } from '../runSoak';
import type { ReadOutcome } from '../classifyRead';

type Cb = () => void;
type Handle = { id: number };

interface FakeClock {
  setIntervalFn: SoakDeps['setIntervalFn'];
  clearIntervalFn: SoakDeps['clearIntervalFn'];
  setTimeoutFn: SoakDeps['setTimeoutFn'];
  now: SoakDeps['now'];
  tick: (ms: number) => void;
}

function makeFakeClock(): FakeClock {
  let nowMs = 0;
  let nextId = 1;
  interface Interval {
    id: number;
    everyMs: number;
    nextFireAt: number;
    cb: Cb;
  }
  interface Timeout {
    id: number;
    fireAt: number;
    cb: Cb;
  }
  const intervals: Interval[] = [];
  const timeouts: Timeout[] = [];

  const setIntervalFn: SoakDeps['setIntervalFn'] = (cb, ms) => {
    const handle = { id: nextId++ } as unknown as NodeJS.Timeout;
    intervals.push({ id: (handle as unknown as Handle).id, everyMs: ms, nextFireAt: nowMs + ms, cb });
    return handle;
  };
  const clearIntervalFn: SoakDeps['clearIntervalFn'] = handle => {
    const id = (handle as unknown as Handle).id;
    const i = intervals.findIndex(x => x.id === id);
    if (i >= 0) intervals.splice(i, 1);
  };
  const setTimeoutFn: SoakDeps['setTimeoutFn'] = (cb, ms) => {
    const handle = { id: nextId++ } as unknown as NodeJS.Timeout;
    timeouts.push({ id: (handle as unknown as Handle).id, fireAt: nowMs + ms, cb });
    return handle;
  };
  const now: SoakDeps['now'] = () => nowMs;

  function tick(ms: number): void {
    const target = nowMs + ms;
    while (true) {
      const nextInterval = intervals
        .map(x => x.nextFireAt)
        .filter(t => t <= target)
        .sort((a, b) => a - b)[0];
      const nextTimeout = timeouts
        .map(x => x.fireAt)
        .filter(t => t <= target)
        .sort((a, b) => a - b)[0];

      const candidates = [nextInterval, nextTimeout].filter(
        (t): t is number => typeof t === 'number'
      );
      if (candidates.length === 0) break;
      const next = Math.min(...candidates);
      nowMs = next;

      // Fire timeouts due at this instant, removing them.
      const dueTimeouts = timeouts.filter(t => t.fireAt === next);
      for (const t of dueTimeouts) {
        timeouts.splice(timeouts.indexOf(t), 1);
        t.cb();
      }

      // Fire each interval whose nextFireAt is this instant.
      for (const iv of intervals.slice()) {
        if (iv.nextFireAt === next) {
          iv.nextFireAt += iv.everyMs;
          iv.cb();
        }
      }
    }
    nowMs = target;
  }

  return { setIntervalFn, clearIntervalFn, setTimeoutFn, now, tick };
}

function makeBaseOpts(overrides: Partial<SoakOptions> = {}): SoakOptions {
  return {
    strategy: 'write',
    targetPath: '/fake/target.txt',
    durationMs: 100,
    writeIntervalMs: 10,
    readIntervalMs: 5,
    inFlightWindow: 2,
    payloadSamples: ['a', 'b', 'c'],
    ...overrides,
  };
}

describe('runSoak', () => {
  it('records ok reads when the reader always sees the latest write', async () => {
    const clock = makeFakeClock();
    const written: string[] = [];

    const writeStrategy: SoakDeps['writeStrategy'] = ({ payload }) => {
      written.push(payload);
    };
    const readFile: SoakDeps['readFile'] = (): ReadOutcome => ({
      kind: 'content',
      content: written[written.length - 1] ?? '',
    });

    const promise = runSoak(makeBaseOpts({ durationMs: 100, writeIntervalMs: 10, readIntervalMs: 5 }), {
      writeStrategy,
      readFile,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      logger: { log: () => {}, warn: () => {} },
    });

    clock.tick(101);
    const report = await promise;

    expect(report.writes).toBeGreaterThan(0);
    expect(report.reads).toBeGreaterThan(0);
    expect(report.buckets.ok).toBe(report.reads);
    expect(report.buckets.empty).toBe(0);
    expect(report.buckets.mismatch).toBe(0);
    expect(report.passed).toBe(true);
  });

  it('reports torn reads when the reader sees an empty file', async () => {
    const clock = makeFakeClock();

    const writeStrategy: SoakDeps['writeStrategy'] = () => {};
    const readFile: SoakDeps['readFile'] = (): ReadOutcome => ({ kind: 'content', content: '' });

    const promise = runSoak(makeBaseOpts({ durationMs: 30, writeIntervalMs: 10, readIntervalMs: 5 }), {
      writeStrategy,
      readFile,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      logger: { log: () => {}, warn: () => {} },
    });

    clock.tick(31);
    const report = await promise;

    expect(report.buckets.empty).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
    expect(report.failures.length).toBeGreaterThan(0);
    expect(report.failures[0].bucket).toBe('empty');
  });

  it('reports mismatch when the reader sees an out-of-window value', async () => {
    const clock = makeFakeClock();
    const writeStrategy: SoakDeps['writeStrategy'] = () => {};
    const readFile: SoakDeps['readFile'] = (): ReadOutcome => ({
      kind: 'content',
      content: 'never_written_value',
    });

    const promise = runSoak(makeBaseOpts({ durationMs: 30 }), {
      writeStrategy,
      readFile,
      now: clock.now,
      setIntervalFn: clock.setIntervalFn,
      clearIntervalFn: clock.clearIntervalFn,
      setTimeoutFn: clock.setTimeoutFn,
      logger: { log: () => {}, warn: () => {} },
    });
    clock.tick(31);
    const report = await promise;

    expect(report.buckets.mismatch).toBeGreaterThan(0);
    expect(report.passed).toBe(false);
  });

  it('rejects empty payloadSamples up-front', () => {
    const clock = makeFakeClock();
    expect(() =>
      runSoak(makeBaseOpts({ payloadSamples: [] }), {
        writeStrategy: () => {},
        readFile: () => ({ kind: 'content', content: '' }),
        now: clock.now,
        setIntervalFn: clock.setIntervalFn,
        clearIntervalFn: clock.clearIntervalFn,
        setTimeoutFn: clock.setTimeoutFn,
        logger: { log: () => {}, warn: () => {} },
      })
    ).toThrow(/payloadSamples/);
  });
});

describe('defaultReadFile', () => {
  it('returns enoent for a missing path', () => {
    const r = defaultReadFile('/definitely/does/not/exist/here.txt');
    expect(r.kind).toBe('enoent');
  });
});
