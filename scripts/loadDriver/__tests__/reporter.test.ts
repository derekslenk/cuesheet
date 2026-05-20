import { formatConsoleReport, evaluateSLO } from '../reporter';
import type { DriverReport } from '../runDriver';

const SAMPLE_REPORT: DriverReport = {
  startedAt: '2026-05-20T00:00:00.000Z',
  finishedAt: '2026-05-20T00:01:00.000Z',
  elapsedMs: 60000,
  totalCalls: 100,
  buckets: { ok: 98, validation: 0, db_lock: 0, http_error: 1, network_error: 1 },
  httpStats: { count: 100, min: 12, max: 1850, p50: 95, p95: 1500, p99: 1800 },
  samples: [],
  failures: [
    { index: 17, screen: 'large', streamId: 3, bucket: 'http_error', latencyMs: 1850, detail: 'HTTP 500: kaboom' },
    { index: 42, screen: 'left', streamId: 5, bucket: 'network_error', latencyMs: 5, detail: 'ECONNREFUSED' },
  ],
};

describe('formatConsoleReport', () => {
  it('includes the headline numbers an operator scans for first', () => {
    const txt = formatConsoleReport(SAMPLE_REPORT);
    expect(txt).toContain('100 calls');
    expect(txt).toContain('60000 ms');
    expect(txt).toContain('p50=95');
    expect(txt).toContain('p95=1500');
    expect(txt).toContain('p99=1800');
    expect(txt).toContain('ok=98');
    expect(txt).toContain('db_lock=0');
  });

  it('lists the first few failures inline', () => {
    const txt = formatConsoleReport(SAMPLE_REPORT);
    expect(txt).toContain('http_error');
    expect(txt).toContain('network_error');
    expect(txt).toContain('ECONNREFUSED');
  });
});

describe('evaluateSLO (Phase 1.4 pass criteria)', () => {
  it('passes when p95 ≤ 2000 ms warm AND db_lock=0', () => {
    const v = evaluateSLO(SAMPLE_REPORT);
    expect(v.dbLockPass).toBe(true);
    expect(v.p95Pass).toBe(true);
    expect(v.overallPass).toBe(true);
  });

  it('fails on db_lock > 0 even if p95 is healthy', () => {
    const r = { ...SAMPLE_REPORT, buckets: { ...SAMPLE_REPORT.buckets, db_lock: 3 } };
    const v = evaluateSLO(r);
    expect(v.dbLockPass).toBe(false);
    expect(v.overallPass).toBe(false);
  });

  it('fails when p95 exceeds 2000 ms', () => {
    const r: DriverReport = {
      ...SAMPLE_REPORT,
      httpStats: { ...SAMPLE_REPORT.httpStats, p95: 2500 },
    };
    const v = evaluateSLO(r);
    expect(v.p95Pass).toBe(false);
    expect(v.overallPass).toBe(false);
  });
});
