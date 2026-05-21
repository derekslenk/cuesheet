import { formatConsoleReport } from '../reporter';
import type { SoakReport } from '../runSoak';

function makeReport(overrides: Partial<SoakReport> = {}): SoakReport {
  return {
    strategy: 'write',
    targetPath: '/tmp/large.txt',
    startedAt: '2026-05-21T00:00:00.000Z',
    finishedAt: '2026-05-21T00:30:00.000Z',
    elapsedMs: 1_800_000,
    writes: 1800,
    reads: 108000,
    buckets: { ok: 108000, empty: 0, enoent: 0, mismatch: 0, read_error: 0 },
    failures: [],
    passed: true,
    ...overrides,
  };
}

describe('formatConsoleReport', () => {
  it('includes a PASS verdict when no torn reads', () => {
    const r = makeReport();
    const out = formatConsoleReport(r);
    expect(out).toMatch(/Verdict:\s+PASS/);
    expect(out).toMatch(/Strategy:\s+write/);
    expect(out).toMatch(/ok:\s+108000/);
  });

  it('includes a FAIL verdict and lists first failures when torn reads found', () => {
    const r = makeReport({
      passed: false,
      buckets: { ok: 99, empty: 1, enoent: 0, mismatch: 0, read_error: 0 },
      failures: [{ atMs: 1500, bucket: 'empty' }],
    });
    const out = formatConsoleReport(r);
    expect(out).toMatch(/Verdict:\s+FAIL/);
    expect(out).toMatch(/\+1500ms empty/);
  });
});
