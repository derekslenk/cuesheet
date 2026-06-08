/**
 * `cuesheet dev` — start the Next.js web UI in development mode.
 *
 * Mirrors what run-dev.cmd does:
 *   - Resolves STREAMLINK_PATH / FFMPEG_PATH / FILE_DIRECTORY via env.ts
 *     (flag → env → .env.local → OS built-in default).
 *   - Spawns `next dev -H 0.0.0.0` as a child process, forwarding its
 *     stdout/stderr to the console.
 *   - Pre-checks port 3000; fails fast with exit code 4 if already bound.
 *   - Resolves the `next` binary from the local node_modules/.bin; falls back
 *     to `bun x next`. Fails with exit code 3 if neither is found.
 *   - Forwards SIGINT/SIGTERM to the child and exits cleanly.
 */

import { spawn, execFileSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import fs from 'node:fs';
import { CliError, EXIT } from '../lib/exit.js';
import { resolveAll, buildChildEnv } from '../lib/env.js';
import { findProjectRoot } from '../lib/paths.js';
import type { CommandContext } from '../lib/types.js';

/** Port Next.js dev listens on. */
const DEV_PORT = 3000;

/** Host passed to `next dev -H`. */
const DEV_HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Port pre-check
// ---------------------------------------------------------------------------

/**
 * Returns true when a TCP connection to host:port succeeds within timeoutMs,
 * indicating something is already bound there.
 */
function isPortBound(port: number, host = '127.0.0.1', timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = net.createConnection({ port, host });
    sock.setTimeout(timeoutMs);
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.once('timeout', () => { sock.destroy(); resolve(false); });
  });
}

// ---------------------------------------------------------------------------
// `next` binary resolution
// ---------------------------------------------------------------------------

/**
 * Locate the `next` binary relative to `cwd`.
 * Tries node_modules/.bin/next[.cmd on win32] first; then falls back to
 * ["bun", "x", "next"] so the caller can use it as a command + args pair.
 *
 * Returns `{ cmd, args, via }` where `via` is a human-readable label for
 * error messages, or throws a CliError (DEP_MISSING) when neither exists.
 */
function resolveNextBin(cwd: string): { cmd: string; args: string[]; via: string } {
  // Local node_modules/.bin/next
  const ext = process.platform === 'win32' ? '.cmd' : '';
  const localBin = path.join(cwd, 'node_modules', '.bin', `next${ext}`);
  if (fs.existsSync(localBin)) {
    return { cmd: localBin, args: [], via: 'node_modules/.bin/next' };
  }

  // Fallback: bun x next (bun must be on PATH)
  try {
    // Check bun is available without running it (just stat the which result)
    const bunPath = execFileSync(
      process.platform === 'win32' ? 'where' : 'which',
      ['bun'],
      { stdio: ['pipe', 'pipe', 'pipe'] },
    ).toString().trim().split(/\r?\n/)[0];
    if (bunPath) {
      return { cmd: bunPath, args: ['x', 'next'], via: 'bun x next' };
    }
  } catch {
    // bun not on PATH — fall through to error
  }

  throw new CliError(
    'Cannot find `next` binary. ' +
    'Run `npm install` (or `bun install`) in the project root to install dependencies.',
    EXIT.DEP_MISSING,
  );
}

// ---------------------------------------------------------------------------
// Command entry point
// ---------------------------------------------------------------------------

export async function run(_argv: string[], ctx: CommandContext): Promise<void> {
  const { cwd, env, stdout, stderr, logger } = ctx;

  // 0. Locate the project root. `next dev` MUST run there (it needs app/ +
  //    node_modules), so the binary works even when invoked from dist/ or any
  //    other directory. Searches cwd first, then the binary's own location.
  const projectRoot = findProjectRoot([cwd, path.dirname(process.execPath)], env);
  if (!projectRoot) {
    throw new CliError(
      'Could not locate the CueSheet project root (need package.json + node_modules + app/). ' +
      'Run `cuesheet dev` from the project directory, or set CUESHEET_PROJECT_ROOT to it.',
      EXIT.DEP_MISSING,
    );
  }

  // 1. Resolve config (uses env.ts precedence chain; .env.local lives in root)
  const resolved = resolveAll({}, env, projectRoot);
  const childEnv = buildChildEnv(resolved, env);

  // 2. Pre-check port
  if (await isPortBound(DEV_PORT)) {
    throw new CliError(
      `Port ${DEV_PORT} is already in use. ` +
      'Stop whatever is running there before starting the Next.js dev server.',
      EXIT.PORT_IN_USE,
    );
  }

  // 3. Resolve the next binary (relative to the project root)
  const { cmd, args: prefixArgs, via } = resolveNextBin(projectRoot);
  const nextArgs = [...prefixArgs, 'dev', '-H', DEV_HOST];

  logger.info(`Starting Next.js dev server via ${via} on http://${DEV_HOST}:${DEV_PORT}`);
  if (path.resolve(projectRoot) !== path.resolve(cwd)) {
    logger.info(`  project root: ${projectRoot}`);
  }
  logger.info(`  STREAMLINK_PATH=${resolved.STREAMLINK_PATH.value ?? '(unset)'} [${resolved.STREAMLINK_PATH.source}]`);
  logger.info(`  FFMPEG_PATH=${resolved.FFMPEG_PATH.value ?? '(unset)'} [${resolved.FFMPEG_PATH.source}]`);
  logger.info(`  FILE_DIRECTORY=${resolved.FILE_DIRECTORY.value ?? '(unset)'} [${resolved.FILE_DIRECTORY.source}]`);

  // 4. Spawn child in the project root, streaming stdio
  await spawnDev({ cmd, args: nextArgs, cwd: projectRoot, env: childEnv, stdout, stderr });
}

// ---------------------------------------------------------------------------
// Internal: spawn + signal forwarding
// ---------------------------------------------------------------------------

interface SpawnDevOpts {
  cmd: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}

function spawnDev({ cmd, args, cwd, env, stdout, stderr }: SpawnDevOpts): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env,
      // stdio: pipe both so we can forward to the injected streams (testable)
      stdio: ['inherit', 'pipe', 'pipe'],
      // Windows: don't open a separate console window
      windowsHide: true,
    });

    child.stdout?.pipe(stdout);
    child.stderr?.pipe(stderr);

    // Forward signals to the child so it can clean up (Next.js flushes routes etc.)
    const forward = (signal: NodeJS.Signals) => {
      if (!child.killed) child.kill(signal);
    };
    process.on('SIGINT', () => forward('SIGINT'));
    process.on('SIGTERM', () => forward('SIGTERM'));

    child.once('error', (err) => {
      reject(new CliError(`Failed to start Next.js: ${err.message}`, EXIT.GENERIC));
    });

    child.once('close', (code, signal) => {
      if (signal) {
        // Killed by signal (normal Ctrl-C path) — exit cleanly
        resolve();
        return;
      }
      if (code === 0 || code === null) {
        resolve();
      } else {
        // Propagate non-zero exit from next dev
        process.exitCode = EXIT.GENERIC;
        resolve();
      }
    });
  });
}
