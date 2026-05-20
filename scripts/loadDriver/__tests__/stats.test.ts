import { computeStats, percentile } from '../stats';

describe('percentile', () => {
  it('returns the requested percentile of a sorted sample', () => {
    const sorted = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(percentile(sorted, 50)).toBe(5);
    expect(percentile(sorted, 95)).toBe(10);
    expect(percentile(sorted, 99)).toBe(10);
    expect(percentile(sorted, 100)).toBe(10);
  });

  it('clamps below into the first slot', () => {
    expect(percentile([10, 20, 30], 0)).toBe(10);
    expect(percentile([10, 20, 30], -10)).toBe(10);
  });

  it('returns NaN for an empty sample', () => {
    expect(percentile([], 50)).toBeNaN();
  });

  it('handles a single-element sample', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 99)).toBe(42);
  });
});

describe('computeStats', () => {
  it('produces count + min/max/p50/p95/p99 for a happy-path sample', () => {
    const samples = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    const s = computeStats(samples);

    expect(s.count).toBe(10);
    expect(s.min).toBe(100);
    expect(s.max).toBe(1000);
    expect(s.p50).toBe(500);
    expect(s.p95).toBe(1000);
    expect(s.p99).toBe(1000);
  });

  it('returns the empty-sample shape with NaN summaries', () => {
    const s = computeStats([]);
    expect(s.count).toBe(0);
    expect(s.min).toBeNaN();
    expect(s.max).toBeNaN();
    expect(s.p50).toBeNaN();
    expect(s.p95).toBeNaN();
    expect(s.p99).toBeNaN();
  });

  it('does not mutate the input array', () => {
    const samples = [3, 1, 2];
    const snapshot = [...samples];
    computeStats(samples);
    expect(samples).toEqual(snapshot);
  });

  it('sorts samples internally regardless of input order', () => {
    const s = computeStats([900, 100, 500, 200, 800, 300, 400, 1000, 600, 700]);
    expect(s.min).toBe(100);
    expect(s.max).toBe(1000);
    expect(s.p50).toBe(500);
  });
});
