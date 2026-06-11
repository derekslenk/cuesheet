#!/usr/bin/env tsx
/**
 * Phase 1.4 — setActive load driver.
 *
 * Fires N setActive HTTP calls evenly spread across a fixed time window,
 * classifies each response (ok / db_lock / http_error / validation /
 * network_error), and reports p50 / p95 / p99 latency plus the Phase 1.4
 * SLO verdict.
 *
 * Default: 100 calls in 60 000 ms = ~600 ms between starts.
 *
 * Stream IDs and screens are picked round-robin from the live /api/streams
 * response × the configurable screen list — so the driver exercises the
 * same code paths the operator does (per-screen file write + DB read).
 *
 * SAFETY:
 *   - Read-only against OBS (this script does NOT touch OBS WebSocket).
 *     The setActive endpoint writes the ${screen}.txt files; the plugin
 *     handles the actual scene switch. We measure the HTTP latency only.
 *   - Refuses to start if /api/streams returns zero rows (nothing to drive).
 *   - Writes a JSON report to disk every run for post-mortem analysis.
 *
 * USAGE:
 *   npm run load:setactive -- [options]
 *   npx tsx scripts/loadDriver.ts [options]
 *
 * OPTIONS:
 *   --webui-url <url>       Base webui URL (default: http://127.0.0.1:3000)
 *   --calls <n>             Total setActive calls (default: 100)
 *   --duration-ms <ms>      Window across which to spread calls (default: 60000)
 *   --screens <list>        Comma-separated screen names (default: all 7
 *                           SCREEN_POSITIONS, e.g. "large,left,top_left")
 *   --output <path>         JSON report destination (default:
 *                           docs/phase-1.4-load-report.<ISO>.json)
 *   --dry-run               Build everything, fetch streams, print the plan,
 *                           do not fire any calls.
 *
 * EXIT:
 *   0 if Phase 1.4 SLO passes (p95 ≤ 2000 ms warm AND db_lock=0)
 *   1 otherwise — so CI / operator pipelines can gate on the script result.
 */

import fs from 'fs';
import path from 'path';

import { SCREEN_POSITIONS } from '../lib/constants';
import { runDriver } from './loadDriver/runDriver';
import type { FetchFn, DriverDeps } from './loadDriver/runDriver';
import { evaluateSLO, formatConsoleReport } from './loadDriver/reporter';
import type { StreamRecord } from './loadDriver/picker';

interface CliArgs {
  webuiUrl: string;
  calls: number;
  durationMs: number;
  screens: string[];
  output: string | null;
  dryRun: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const out: CliArgs = {
    webuiUrl: 'http://127.0.0.1:3000',
    calls: 100,
    durationMs: 60000,
    screens: [...SCREEN_POSITIONS],
    output: null,
    dryRun: false,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    switch (a) {
      case '--webui-url': out.webuiUrl = args[++i]; break;
      case '--calls': out.calls = parseInt(args[++i], 10); break;
      case '--duration-ms': out.durationMs = parseInt(args[++i], 10); break;
      case '--screens': out.screens = args[++i].split(',').map(s => s.trim()).filter(Boolean); break;
      case '--output': out.output = args[++i]; break;
      case '--dry-run': out.dryRun = true; break;
      case '-h':
      case '--help':
        process.stdout.write(usage());
        process.exit(0);
         
        break;
      default:
        process.stderr.write(`Unknown argument: ${a}\n\n${usage()}`);
        process.exit(2);
    }
  }

  if (!Number.isFinite(out.calls) || out.calls <= 0) {
    throw new Error(`--calls must be a positive integer (got ${out.calls})`);
  }
  if (!Number.isFinite(out.durationMs) || out.durationMs <= 0) {
    throw new Error(`--duration-ms must be a positive integer (got ${out.durationMs})`);
  }
  if (out.screens.length === 0) {
    throw new Error('--screens must list at least one screen');
  }
  for (const s of out.screens) {
    if (!(SCREEN_POSITIONS as readonly string[]).includes(s)) {
      throw new Error(`--screens contains unknown screen "${s}" (valid: ${SCREEN_POSITIONS.join(', ')})`);
    }
  }

  return out;
}

function usage(): string {
  return [
    'Usage: tsx scripts/loadDriver.ts [options]',
    '',
    'Options:',
    '  --webui-url <url>       Base webui URL                  (default: http://127.0.0.1:3000)',
    '  --calls <n>             Total setActive calls           (default: 100)',
    '  --duration-ms <ms>      Window for the calls            (default: 60000)',
    '  --screens <list>        Comma-separated screen names    (default: all 7 SCREEN_POSITIONS)',
    '  --output <path>         JSON report destination         (default: docs/phase-1.4-load-report.<ISO>.json)',
    '  --dry-run               Show plan, do not fire calls',
    '  -h, --help              This help',
    '',
  ].join('\n');
}

async function fetchStreams(baseUrl: string): Promise<StreamRecord[]> {
  const url = `${baseUrl.replace(/\/+$/, '')}/api/streams`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`GET ${url} → ${res.status} ${res.statusText}. Is the webui running and DB initialized?`);
  }
  const body = await res.json();
  const data = body?.success ? body.data : body;
  if (!Array.isArray(data)) {
    throw new Error(`GET ${url} returned non-array body: ${JSON.stringify(body).slice(0, 200)}`);
  }
  return data as StreamRecord[];
}

function defaultOutputPath(): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'docs', `phase-1.4-load-report.${iso}.json`);
}

function makeFetchFn(): FetchFn {
  return async (url, init) => {
    const res = await fetch(url, init);
    const body = await res.text();
    return { status: res.status, body };
  };
}

export async function run(argv: string[]): Promise<void> {
  const args = parseArgs(['', '', ...argv]);

  process.stdout.write(`Fetching stream pool from ${args.webuiUrl}/api/streams ...\n`);
  const streams = await fetchStreams(args.webuiUrl);

  if (streams.length === 0) {
    process.stderr.write(
      'ERROR: /api/streams returned 0 streams. The driver needs at least one stream to target.\n' +
      '       Seed the DB before running this script.\n'
    );
    process.exit(2);
  }
  process.stdout.write(`Got ${streams.length} streams. Targeting screens: ${args.screens.join(', ')}\n`);
  process.stdout.write(`Plan: ${args.calls} calls across ${args.durationMs} ms = ${(args.durationMs / args.calls).toFixed(0)} ms between starts.\n`);

  if (args.dryRun) {
    process.stdout.write('--dry-run set; not firing any setActive calls. Exiting 0.\n');
    process.exit(0);
  }

  const deps: DriverDeps = {
    fetchFn: makeFetchFn(),
    now: () => performance.now(),
    setTimeoutFn: (cb, ms) => setTimeout(cb, ms),
    logger: { log: msg => process.stdout.write(`${msg}\n`), warn: msg => process.stderr.write(`${msg}\n`) },
  };

  const report = await runDriver(
    {
      webuiUrl: args.webuiUrl,
      streams,
      screens: args.screens,
      calls: args.calls,
      durationMs: args.durationMs,
    },
    deps
  );

  process.stdout.write(`\n${formatConsoleReport(report)}\n`);

  const outputPath = args.output ?? defaultOutputPath();
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`\nJSON report → ${outputPath}\n`);

  const slo = evaluateSLO(report);
  process.exitCode = slo.overallPass ? 0 : 1;
}

if (import.meta.main) {
  run(process.argv.slice(2)).catch(err => {
    process.stderr.write(`Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}
