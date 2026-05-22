#!/usr/bin/env node
/**
 * Phase 2.2 — atomic-write soak (ESM mirror of atomicWriteSoak.ts).
 *
 * Same algorithm as the .ts entry; lives alongside so the soak can run
 * on hosts without tsx (the Phase 2.2 F1 Windows soak on the OBS host).
 * Keep behavior identical between this file and atomicWriteSoak.ts.
 *
 * USAGE:
 *   node scripts/atomicWriteSoak.mjs --strategy=rename --duration-ms 1800000
 *
 * EXIT:
 *   0 if zero torn reads observed
 *   1 if any torn reads observed
 */
import fs from 'fs';
import path from 'path';
import { pickStrategy, isValidStrategy, strategyOutputBase } from './atomicWriteSoak/strategies.mjs';
import { runSoak, defaultReadFile } from './atomicWriteSoak/runSoak.mjs';
import { formatConsoleReport } from './atomicWriteSoak/reporter.mjs';

const DEFAULT_PAYLOADS = [
  'team_red_alpha_stream',
  'team_blue_bravo_stream',
  'team_green_charlie_stream',
  'team_yellow_delta_stream',
  'team_purple_echo_stream',
];

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    strategy: 'write',
    durationMs: 1_800_000,
    writeIntervalMs: 1000,
    readIntervalMs: 17,
    inFlightWindow: 4,
    targetDir: path.resolve(process.cwd(), 'docs', 'atomic-write-soak-tmp'),
    output: null,
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--strategy') {
      const v = args[++i];
      if (!isValidStrategy(v)) {
        throw new Error(`--strategy must be "write" or "rename" (got "${v}")`);
      }
      out.strategy = v;
    } else if (a.startsWith('--strategy=')) {
      const v = a.slice('--strategy='.length);
      if (!isValidStrategy(v)) {
        throw new Error(`--strategy must be "write" or "rename" (got "${v}")`);
      }
      out.strategy = v;
    } else if (a === '--duration-ms') {
      out.durationMs = parseInt(args[++i], 10);
    } else if (a === '--write-interval-ms') {
      out.writeIntervalMs = parseInt(args[++i], 10);
    } else if (a === '--read-interval-ms') {
      out.readIntervalMs = parseInt(args[++i], 10);
    } else if (a === '--in-flight-window') {
      out.inFlightWindow = parseInt(args[++i], 10);
    } else if (a === '--target-dir') {
      out.targetDir = path.resolve(args[++i]);
    } else if (a === '--output') {
      out.output = args[++i];
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(usage());
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${a}\n\n${usage()}`);
      process.exit(2);
    }
  }

  if (!Number.isFinite(out.durationMs) || out.durationMs <= 0) {
    throw new Error(`--duration-ms must be positive (got ${out.durationMs})`);
  }
  if (!Number.isFinite(out.writeIntervalMs) || out.writeIntervalMs <= 0) {
    throw new Error(`--write-interval-ms must be positive (got ${out.writeIntervalMs})`);
  }
  if (!Number.isFinite(out.readIntervalMs) || out.readIntervalMs <= 0) {
    throw new Error(`--read-interval-ms must be positive (got ${out.readIntervalMs})`);
  }
  if (!Number.isFinite(out.inFlightWindow) || out.inFlightWindow < 1) {
    throw new Error(`--in-flight-window must be >= 1 (got ${out.inFlightWindow})`);
  }
  return out;
}

function usage() {
  return [
    'Usage: node scripts/atomicWriteSoak.mjs [options]',
    '',
    'Options:',
    '  --strategy <write|rename>      Write strategy under test       (default: write)',
    '  --duration-ms <ms>             Soak duration                    (default: 1800000 = 30 min)',
    '  --write-interval-ms <ms>       Writer tick interval             (default: 1000)',
    '  --read-interval-ms <ms>        Reader tick interval             (default: 17 ≈ 60 Hz)',
    '  --in-flight-window <n>         Recent-values valid set size     (default: 4)',
    '  --target-dir <dir>             Where to place the soak file     (default: docs/atomic-write-soak-tmp)',
    '  --output <path>                JSON report destination          (default: docs/atomic-write-soak.<strategy>.<ISO>.json)',
    '  -h, --help                     This help',
    '',
  ].join('\n');
}

function defaultOutputPath(strategy) {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'docs', `atomic-write-soak.${strategy}.${iso}.json`);
}

async function main() {
  const args = parseArgs(process.argv);

  fs.mkdirSync(args.targetDir, { recursive: true });
  const targetPath = strategyOutputBase(args.strategy, args.targetDir);

  process.stdout.write(
    `Soak: strategy=${args.strategy} duration=${args.durationMs}ms ` +
      `write=${args.writeIntervalMs}ms read=${args.readIntervalMs}ms target=${targetPath}\n`
  );

  const report = await runSoak(
    {
      strategy: args.strategy,
      targetPath,
      durationMs: args.durationMs,
      writeIntervalMs: args.writeIntervalMs,
      readIntervalMs: args.readIntervalMs,
      inFlightWindow: args.inFlightWindow,
      payloadSamples: DEFAULT_PAYLOADS,
    },
    {
      writeStrategy: pickStrategy(args.strategy),
      readFile: defaultReadFile,
      now: () => performance.now(),
      setIntervalFn: (cb, ms) => setInterval(cb, ms),
      clearIntervalFn: handle => clearInterval(handle),
      setTimeoutFn: (cb, ms) => setTimeout(cb, ms),
      logger: {
        log: msg => process.stdout.write(`${msg}\n`),
        warn: msg => process.stderr.write(`${msg}\n`),
      },
    }
  );

  process.stdout.write(`\n${formatConsoleReport(report)}\n`);

  const outputPath = args.output ?? defaultOutputPath(args.strategy);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');
  process.stdout.write(`\nJSON report → ${outputPath}\n`);

  process.exit(report.passed ? 0 : 1);
}

main().catch(err => {
  process.stderr.write(`Unhandled error: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(2);
});
