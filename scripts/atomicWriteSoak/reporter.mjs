// ESM mirror of reporter.ts.
export function formatConsoleReport(report) {
  const seconds = (report.elapsedMs / 1000).toFixed(1);
  const writesPerSec = (report.writes / (report.elapsedMs / 1000)).toFixed(2);
  const readsPerSec = (report.reads / (report.elapsedMs / 1000)).toFixed(1);
  const lines = [
    '=== Atomic-write soak report ===',
    `Strategy:      ${report.strategy}`,
    `Target:        ${report.targetPath}`,
    `Duration:      ${seconds} s`,
    `Writes:        ${report.writes} (${writesPerSec}/s)`,
    `Reads:         ${report.reads} (${readsPerSec}/s)`,
    'Buckets:',
    `  ok:         ${report.buckets.ok}`,
    `  empty:      ${report.buckets.empty}`,
    `  enoent:     ${report.buckets.enoent}`,
    `  mismatch:   ${report.buckets.mismatch}`,
    `  read_error: ${report.buckets.read_error}`,
    `Verdict:       ${report.passed ? 'PASS — zero torn reads' : 'FAIL — torn reads observed'}`,
  ];
  if (!report.passed && report.failures.length > 0) {
    const sample = report.failures.slice(0, 5);
    lines.push('First failures:');
    for (const f of sample) {
      lines.push(`  +${f.atMs}ms ${f.bucket}${f.detail ? ` — ${f.detail}` : ''}`);
    }
    if (report.failures.length > sample.length) {
      lines.push(`  …${report.failures.length - sample.length} more`);
    }
  }
  return lines.join('\n');
}
