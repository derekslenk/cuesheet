/**
 * `cuesheet start [--which both|sup|web]` — launch dev and/or the supervisor
 * DETACHED and record managed process records so `cuesheet stop` can terminate
 * exactly those processes later (and nothing else).
 *
 * Replaces mon-start.ps1. Unlike the old script (which grepped the process
 * table by command-line substring), we:
 *   - re-exec THIS binary's own `dev` / `sup` subcommands detached, so the
 *     children are real cuesheet processes;
 *   - redirect their stdout/stderr to per-role log files (lib/log.ts), since a
 *     detached child has no console (R9);
 *   - persist a {@link ProcessRecord} (pid + startTime + fingerprint + ports +
 *     logPath + role) via lib/procState.ts (R4/R10);
 *   - pre-check the ports each service needs and exit 4 if one is already bound
 *     (AC11).
 *
 * Idempotency: if a service is already tracked AND live, we skip re-launching it
 * (matches mon-start.ps1's "don't double-start" behavior) rather than orphaning
 * the previous process.
 */
import { spawn } from 'node:child_process';
import net from 'node:net';
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import * as procState from '../lib/procState.js';
import { openProcessLog, writeLogLine } from '../lib/log.js';
import { resolveAll } from '../lib/env.js';
import { CliError, EXIT } from '../lib/exit.js';
import type { CommandContext, ProcessRecord, Role, Which } from '../lib/types.js';

/** Per-role launch spec: the subcommand to run and the ports it should own. */
interface LaunchSpec {
  role: Role;
  /** The `cuesheet` subcommand that runs this service in-process. */
  subcommand: 'dev' | 'sup';
  /** Ports the service is expected to bind; pre-checked before launch. */
  ports: number[];
}

export async function run(argv: string[], ctx: CommandContext): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { which: { type: 'string', default: 'both' } },
    strict: false,
  });

  const which = normalizeWhich(values.which as string | undefined);
  const specs = launchSpecs(which, ctx);

  // Drop any stale records up front so an old crashed entry doesn't make us
  // think a service is still running (and warn about what we cleared).
  for (const removed of procState.reconcile(ctx.env)) {
    ctx.logger.warn(`cleared stale ${removed.role} record (pid ${removed.pid} no longer running)`);
  }

  let launched = 0;
  for (const spec of specs) {
    const existing = procState.get(spec.role, ctx.env);
    if (existing && procState.isLive(existing)) {
      ctx.logger.info(`${spec.role} already running (pid ${existing.pid}); skipping`);
      continue;
    }
    await startOne(spec, ctx);
    launched++;
  }

  if (launched === 0) {
    ctx.logger.info('nothing to start (all requested services already running)');
  }
}

/** Launch a single service detached and record it. */
async function startOne(spec: LaunchSpec, ctx: CommandContext): Promise<void> {
  // Port pre-check: refuse to start if a port the service needs is taken — a
  // second `next dev` or supervisor would silently grab a different port and
  // diverge from what we record. Exit 4 (PORT_IN_USE) per AC11.
  for (const port of spec.ports) {
    if (await isPortInUse(port)) {
      throw new CliError(
        `cannot start ${spec.role}: port ${port} is already in use`,
        EXIT.PORT_IN_USE,
      );
    }
  }

  const { logPath, fd } = openProcessLog(spec.role, ctx.env);

  // Re-exec ourselves to launch the detached child.
  const reexecArgs = computeReexecArgs(process.execPath, process.argv[1], spec.subcommand);

  // Forward resolved config to the child so a detached supervisor/dev sees the
  // same STREAMLINK_PATH/FFMPEG_PATH/ports the parent resolved.
  const resolved = resolveAll({}, ctx.env, ctx.cwd);
  const childEnv = buildChildEnvFor(resolved, ctx.env);

  const child = spawn(process.execPath, reexecArgs, {
    cwd: ctx.cwd,
    env: childEnv,
    // POSIX: detached starts the child in its own process group so stop.ts can
    // signal the whole group via the negative PGID. On win32, detached +
    // taskkill /T handles the tree; we don't need a new console window.
    detached: true,
    stdio: ['ignore', fd, fd],
    windowsHide: true,
  });

  const pid = child.pid;
  if (pid === undefined) {
    try { fs.closeSync(fd); } catch { /* already closed */ }
    throw new CliError(`failed to spawn ${spec.role}`, EXIT.GENERIC);
  }

  const startTime = new Date().toISOString();
  writeLogLine(fd, `--- cuesheet start ${spec.role} (pid ${pid}) ---`);
  // The detached child holds its own dup of the log fd; the parent no longer
  // needs it. Closing matters for the long-lived gui (its restart re-runs this).
  try { fs.closeSync(fd); } catch { /* already closed */ }

  const record: ProcessRecord = {
    role: spec.role,
    pid,
    startTime,
    cmdFingerprint: procState.makeFingerprint([process.execPath, ...reexecArgs], ctx.cwd),
    ports: spec.ports,
    logPath,
  };
  procState.add(record, ctx.env);

  // Let the child outlive us: don't keep the event loop waiting on it.
  child.unref();

  ctx.logger.info(`started ${spec.role} (pid ${pid}) → ${logPath}`);

  // Dead-on-arrival check: if the child exits within a short window (e.g. the
  // supervisor can't open its DB, or `next` can't find the app dir), drop the
  // record so status/gui never show a phantom pid, and point at the log.
  await delay(300);
  if (child.exitCode !== null || child.signalCode !== null) {
    procState.remove(spec.role, ctx.env);
    ctx.logger.warn(
      `${spec.role} exited immediately (code ${child.exitCode ?? child.signalCode}); see ${logPath}`,
    );
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Compute the args to re-exec ourselves with for a detached child.
 *
 * Compiled (`bun --compile`): `process.execPath` IS the cuesheet binary, and
 * `process.argv[1]` is a VIRTUAL bun path (e.g. `B:/~BUN/root/cuesheet.exe` on
 * Windows, `/$bunfs/root/...` on POSIX). Forwarding that virtual path makes
 * commander treat it as an unknown command and the child dies instantly — so we
 * pass ONLY the subcommand and spawn the binary directly.
 *
 * Interpreter (`bun run` / `node` / `tsx`): `execPath` is the runtime and
 * `argv[1]` is the real entry script, which MUST be forwarded so the spawned
 * child re-enters our CLI.
 *
 * Detection keys off the runtime basename rather than comparing argv[1] to
 * execPath (those differ in BOTH modes, which was the original bug).
 */
export function computeReexecArgs(
  execPath: string,
  argv1: string | undefined,
  subcommand: string,
): string[] {
  const runtime = execPath.replace(/\\/g, '/').split('/').pop()?.toLowerCase() ?? '';
  const underInterpreter = /^(bun|bunx|node|nodejs|tsx|deno)(\.exe)?$/.test(runtime);
  return underInterpreter && argv1 ? [argv1, subcommand] : [subcommand];
}

/** Promise-based delay (no CPU spin). */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Validate/normalize the --which flag. */
function normalizeWhich(raw: string | undefined): Which {
  const v = (raw ?? 'both').toLowerCase();
  if (v === 'both' || v === 'sup' || v === 'web') return v;
  throw new CliError(`invalid --which '${raw}' (expected both|sup|web)`, EXIT.USAGE);
}

/** Resolve which services to launch and the ports each owns. */
function launchSpecs(which: Which, ctx: CommandContext): LaunchSpec[] {
  const resolved = resolveAll({}, ctx.env, ctx.cwd);
  const healthPort = toPort(resolved.SUPERVISOR_HEALTH_PORT.value, 8080);
  const basePort = toPort(resolved.SUPERVISOR_BASE_PORT.value, 9001);
  const webPort = toPort(ctx.env.PORT, 3000);

  const sup: LaunchSpec = { role: 'sup', subcommand: 'sup', ports: [healthPort, basePort] };
  const web: LaunchSpec = { role: 'web', subcommand: 'dev', ports: [webPort] };

  if (which === 'sup') return [sup];
  if (which === 'web') return [web];
  return [sup, web];
}

function toPort(value: string | undefined, fallback: number): number {
  const n = value !== undefined ? Number.parseInt(value, 10) : NaN;
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * True if a TCP port is already bound on the loopback/all-interfaces. We probe
 * by trying to LISTEN: EADDRINUSE means something already owns it. Listening is
 * a more reliable "is it taken" signal than connecting (a port can be bound but
 * not yet accepting). Binds to 0.0.0.0 to match how dev/sup listen.
 */
function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err: NodeJS.ErrnoException) => {
      tester.close();
      resolve(err.code === 'EADDRINUSE');
    });
    tester.once('listening', () => {
      tester.close(() => resolve(false));
    });
    tester.listen(port, '0.0.0.0');
  });
}

/**
 * Build the child env, forwarding resolved config. Mirrors env.ts's
 * buildChildEnv but local so start.ts owns exactly which keys it propagates.
 */
function buildChildEnvFor(
  resolved: ReturnType<typeof resolveAll>,
  base: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  const entries: Array<[string, string | undefined]> = [
    ['STREAMLINK_PATH', resolved.STREAMLINK_PATH.value],
    ['FFMPEG_PATH', resolved.FFMPEG_PATH.value],
    ['FILE_DIRECTORY', resolved.FILE_DIRECTORY.value],
    ['SUPERVISOR_HEALTH_PORT', resolved.SUPERVISOR_HEALTH_PORT.value],
    ['SUPERVISOR_BASE_PORT', resolved.SUPERVISOR_BASE_PORT.value],
    ['SUPERVISOR_MAX_PORTS', resolved.SUPERVISOR_MAX_PORTS.value],
    ['SUPERVISOR_HEALTH_HOST', resolved.SUPERVISOR_HEALTH_HOST.value],
  ];
  for (const [k, v] of entries) {
    if (v !== undefined) out[k] = v;
  }
  return out;
}
