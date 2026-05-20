export interface Stats {
  count: number;
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const clampedP = Math.max(0, Math.min(100, p));
  const idx = Math.ceil((clampedP / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

export function computeStats(samples: readonly number[]): Stats {
  if (samples.length === 0) {
    return { count: 0, min: NaN, max: NaN, p50: NaN, p95: NaN, p99: NaN };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}
