#!/usr/bin/env tsx
/**
 * Phase 2.2 — atomic-write soak.
 *
 * Spawns a writer (default 1 Hz) and reader (default 60 Hz) against a
 * single ${screen}.txt-equivalent file, using one of two write strategies:
 *
 *   --strategy=write   fs.writeFileSync (current setActive behavior)
 *   --strategy=rename  fs.writeFileSync(tmp) then fs.renameSync(tmp,target)
 *
 * The reader compares each read against the sliding set of recently-written
 * values; anything outside that set (empty file, ENOENT, partial/wrong
 * bytes, read error) is logged as a torn read.
 *
 * Phase 2.2 acceptance: zero torn reads in the chosen strategy over a
 * 30-min run under the 1000 ms G2 polling floor.
 *
 * USAGE:
 *   npm run soak:atomic-write -- --strategy=write --duration-ms 1800000
 *   npx tsx scripts/atomicWriteSoak.ts --strategy=rename --duration-ms 1800000
 *
 * EXIT:
 *   0 if zero torn reads observed
 *   1 if any torn reads observed
 */
import fs from 'fs';
import path from 'path';

import { pickStrategy, isValidStrategy, strategyOutputBase } from './atomicWriteSoak/strategies';
import type { StrategyName } from './atomicWriteSoak/strategies';
import { runSoak, defaultReadFile } from './atomicWriteSoak/runSoak';
import { formatConsoleReport } from './atomicWriteSoak/reporter';

interface CliArgs {
  strategy: StrategyName;
  durationMs: number;
  writeIntervalMs: number;
  readIntervalMs: number;
  inFlightWindow: number;
  targetDir: string;
  output: string | null;
}

const DEFAULT_PAYLOADS = [
  'team_red_alpha_stream',
  'team_blue_bravo_stream',
  'team_green_charlie_stream',
  'team_yellow_delta_stream',
  'team_purple_echo_stream',
];

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  const out: CliArgs = {
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
    switch (a) {
      case '--strategy': {
        const v = args[++i];
        if (!isValidStrategy(v)) {
          throw new Error(`--strategy must be "write" or "rename" (got "${v}")`);
        }
        out.strategy = v;
        break;
      }
      case '--duration-ms':
        out.durationMs = parseInt(args[++i], 10);
        break;
      case '--write-interval-ms':
        out.writeIntervalMs = parseInt(args[++i], 10);
        break;
      case '--read-interval-ms':
        out.readIntervalMs = parseInt(args[++i], 10);
        break;
      case '--in-flight-window':
        out.inFlightWindow = parseInt(args[++i], 10);
        break;
      case '--target-dir':
        out.targetDir = path.resolve(args[++i]);
        break;
      case '--output':
        out.output = args[++i];
        break;
      case '-h':
      case '--help':
        process.stdout.write(usage());
        process.exit(0);
      // eslint-disable-next-line no-fallthrough
      default:
        if (a.startsWith('--strategy=')) {
          const v = a.slice('--strategy='.length);
          if (!isValidStrategy(v)) {
            throw new Error(`--strategy must be "write" or "rename" (got "${v}")`);
          }
          out.strategy = v;
          break;
        }
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

function usage(): string {
  return [
    'Usage: tsx scripts/atomicWriteSoak.ts [options]',
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

function defaultOutputPath(strategy: StrategyName): string {
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  return path.resolve(process.cwd(), 'docs', `atomic-write-soak.${strategy}.${iso}.json`);
}

async function main(): Promise<void> {
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
