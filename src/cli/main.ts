#!/usr/bin/env bun
/**
 * `cuesheet` — unified cross-platform CLI.
 *
 * One binary (built via `bun build --compile`) that replaces the project's
 * scattered .cmd/.ps1 launchers and tsx entry points. See
 * .omc/plans/unified-cuesheet-binary.md.
 *
 * Architecture note: the supervisor command is bun-only (imports `bun:sqlite`
 * and embeds dashboard.html via an import attribute). It is type-checked via the
 * surgical shims in src/cli/types/bun-shims.d.ts and reached through a LITERAL
 * dynamic import so `bun build --compile` bundles it into the binary. All
 * command modules are reached via literal dynamic imports (loaded on demand).
 */
import { Command } from 'commander';
import { EXIT, CliError } from './lib/exit.js';
import { consoleLogger } from './lib/log.js';
import type { CommandContext } from './lib/types.js';

function makeCtx(): CommandContext {
  return {
    cwd: process.cwd(),
    env: process.env,
    stdout: process.stdout,
    stderr: process.stderr,
    logger: consoleLogger,
  };
}

/** Wrap a command action so thrown CliErrors map to process.exitCode. */
function guard<A extends unknown[]>(fn: (...args: A) => Promise<unknown> | unknown): (...args: A) => Promise<void> {
  return async (...args: A) => {
    try {
      await fn(...args);
    } catch (err) {
      if (err instanceof CliError) {
        process.exitCode = err.code;
        console.error(`error: ${err.message}`);
      } else {
        process.exitCode = EXIT.GENERIC;
        console.error(err instanceof Error ? err.stack ?? err.message : String(err));
      }
    }
  };
}

const program = new Command();
program
  .name('cuesheet')
  .description('CueSheet control binary — launchers, supervisor, and ops tools in one place.')
  .version('0.1.0');

// ── Launchers ──────────────────────────────────────────────────────────────
program
  .command('dev')
  .description('Start the Next.js web UI (:3000). Spawns `next dev`.')
  .action(guard(async () => { const { run } = await import('./commands/dev.js'); await run([], makeCtx()); }));

program
  .command('sup')
  .aliases(['supervisor'])
  .description('Run the streamlink supervisor (:8080) in-process.')
  .action(guard(async () => { const { run } = await import('./commands/supervisor.bun.js'); await run([], makeCtx()); }));

program
  .command('watch')
  .description('Live-monitor supervisor + web UI (refreshes every 2s).')
  .action(guard(async () => { const { run } = await import('./commands/watch.js'); await run([], makeCtx()); }));

program
  .command('status')
  .description('One-shot status of supervisor, web UI, and tracked processes.')
  .option('--json', 'machine-readable output')
  .option('--logs', 'include tail of per-process logs')
  .option('--diagnose', 'include resolved env/paths')
  .action(guard(async (opts: Record<string, unknown>) => { const { run } = await import('./commands/status.js'); await run(optsToArgv(opts), makeCtx()); }));

program
  .command('start')
  .description('Start dev and/or supervisor (detached, tracked).')
  .option('--which <which>', 'both | sup | web', 'both')
  .action(guard(async (opts: Record<string, unknown>) => { const { run } = await import('./commands/start.js'); await run(optsToArgv(opts), makeCtx()); }));

program
  .command('stop')
  .description('Stop tracked dev/supervisor processes (precise, group-aware).')
  .option('--which <which>', 'both | sup | web', 'both')
  .action(guard(async (opts: Record<string, unknown>) => { const { run } = await import('./commands/stop.js'); await run(optsToArgv(opts), makeCtx()); }));

program
  .command('gui')
  .aliases(['dashboard'])
  .description('Terminal UI control center (status + start/stop/restart).')
  .action(guard(async () => { const { run } = await import('./commands/gui.js'); await run([], makeCtx()); }));

program
  .command('doctor')
  .description('Diagnose environment: deps, ports, paths, resolved config.')
  .action(guard(async () => { const { run } = await import('./commands/doctor.js'); await run([], makeCtx()); }));

// ── Ops / test tools (argv passed through to the underlying module) ──────────
function passthrough(name: string, file: string, desc: string): void {
  program
    .command(name)
    .description(desc)
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .argument('[args...]', 'arguments forwarded to the tool')
    .action(guard(async (args: string[] = []) => { const { run } = await import(file); await run(args ?? [], makeCtx()); }));
}

passthrough('loadtest', './commands/loadtest.js', 'Load-test harness (seed|prep|start|cycle|status|stop|teardown).');
passthrough('loaddriver', './commands/loaddriver.js', 'Set-active load driver.');
passthrough('soak', './commands/soak.js', 'Atomic-write durability soak test.');
passthrough('clean-obs', './commands/cleanObs.js', 'Clean/maintain the OBS collection.');
passthrough('measure-latency', './commands/measureLatency.js', 'Measure source-switcher latency.');
passthrough('verify-switcher-coverage', './commands/verifySwitcherCoverage.js', 'Verify switcher coverage.');

/** Flatten commander's parsed options object into an argv array for run(). */
function optsToArgv(opts: Record<string, unknown>): string[] {
  const argv: string[] = [];
  for (const [k, v] of Object.entries(opts)) {
    if (v === true) argv.push(`--${k}`);
    else if (v !== false && v != null) argv.push(`--${k}`, String(v));
  }
  return argv;
}

program.parseAsync(process.argv).catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = EXIT.GENERIC;
});
