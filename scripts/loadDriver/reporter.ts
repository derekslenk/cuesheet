import type { DriverReport } from './runDriver';

export interface SLOResult {
  p95Pass: boolean;
  dbLockPass: boolean;
  overallPass: boolean;
  p95LimitMs: number;
}

const P95_LIMIT_MS = 2000;

/**
 * Phase 1.4 SLO gate: p95 ≤ 2000 ms warm AND zero "database is locked" responses.
 * (RSS growth and FD leaks are operator-observed externally — out of script scope.)
 */
export function evaluateSLO(r: DriverReport): SLOResult {
  const p95Pass = Number.isFinite(r.httpStats.p95) && r.httpStats.p95 <= P95_LIMIT_MS;
  const dbLockPass = r.buckets.db_lock === 0;
  return {
    p95Pass,
    dbLockPass,
    overallPass: p95Pass && dbLockPass,
    p95LimitMs: P95_LIMIT_MS,
  };
}

export function formatConsoleReport(r: DriverReport): string {
  const slo = evaluateSLO(r);
  const lines: string[] = [];
  lines.push('═'.repeat(60));
  lines.push('Phase 1.4 — setActive load driver report');
  lines.push('═'.repeat(60));
  lines.push(`Window:     ${r.startedAt} → ${r.finishedAt}`);
  lines.push(`Elapsed:    ${r.elapsedMs} ms`);
  lines.push(`Issued:     ${r.totalCalls} calls`);
  lines.push('');
  lines.push('Outcome buckets:');
  lines.push(`  ok=${r.buckets.ok}  db_lock=${r.buckets.db_lock}  http_error=${r.buckets.http_error}  validation=${r.buckets.validation}  network_error=${r.buckets.network_error}`);
  lines.push('');
  lines.push('HTTP latency (ms):');
  const s = r.httpStats;
  lines.push(`  count=${s.count}  min=${s.min}  p50=${s.p50}  p95=${s.p95}  p99=${s.p99}  max=${s.max}`);
  lines.push('');
  lines.push('SLO gate (Phase 1.4):');
  lines.push(`  p95 ≤ ${slo.p95LimitMs} ms warm: ${slo.p95Pass ? '✅ PASS' : '❌ FAIL'} (measured ${s.p95} ms)`);
  lines.push(`  zero "database is locked":  ${slo.dbLockPass ? '✅ PASS' : '❌ FAIL'} (measured ${r.buckets.db_lock})`);
  lines.push(`  overall: ${slo.overallPass ? '✅ PASS' : '❌ FAIL'}`);

  if (r.failures.length > 0) {
    lines.push('');
    lines.push(`Failures (${r.failures.length}, first 10):`);
    for (const f of r.failures.slice(0, 10)) {
      lines.push(`  [${f.index}] ${f.bucket} screen=${f.screen} streamId=${f.streamId} latency=${f.latencyMs}ms — ${f.detail ?? ''}`);
    }
    if (r.failures.length > 10) {
      lines.push(`  … and ${r.failures.length - 10} more (see JSON report)`);
    }
  }

  lines.push('═'.repeat(60));
  return lines.join('\n');
}
