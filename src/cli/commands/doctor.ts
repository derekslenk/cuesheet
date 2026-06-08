/**
 * `cuesheet doctor` — validate the environment and print resolved config.
 *
 * Checks (in order, stops at first failure):
 *   1. streamlink discoverable (via lib/env.ts resolved STREAMLINK_PATH)
 *   2. ffmpeg discoverable (via lib/env.ts resolved FFMPEG_PATH)
 *   3. port 3000 bindable (Next.js dev)
 *   4. port 8080 bindable (supervisor health)
 *   5. data dir, log dir, run-state dir creatable + writable (lib/paths.ts)
 *   6. sources.db parent directory resolvable (FILE_DIRECTORY)
 *
 * Exits 0 when all checks pass.  Exits 3 (DEP_MISSING) on the first failure,
 * printing a clear message explaining what failed and why.
 *
 * Also prints a resolved-config table showing every known config key, its
 * current value, and where the value came from (flag / env / .env.local /
 * default / PATH / unset) so the user can diagnose surprises at a glance.
 *
 * AC10: `cuesheet doctor` exits 0 when streamlink+ffmpeg found, ports
 * bindable, and data/log/run-state dirs writable; exits 3 otherwise.
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { resolveAll } from '../lib/env.js';
import { dataDir, logDir, runStatePath } from '../lib/paths.js';
import { EXIT, CliError } from '../lib/exit.js';
import type { CommandContext, ResolvedValue } from '../lib/types.js';

// ---------------------------------------------------------------------------
// Check result
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

/** Verify a binary path exists and is executable (stat is enough — we don't spawn). */
function checkBinary(name: string, resolved: ResolvedValue): CheckResult {
  if (!resolved.value) {
    return {
      name,
      ok: false,
      detail: `not found (source: ${resolved.source}) — install it or set ${name} in .env.local`,
    };
  }
  try {
    fs.accessSync(resolved.value, fs.constants.F_OK | fs.constants.X_OK);
    return { name, ok: true, detail: resolved.value };
  } catch {
    return {
      name,
      ok: false,
      detail: `${resolved.value} exists in config but is not executable (source: ${resolved.source})`,
    };
  }
}

/** Try to bind a TCP port; EADDRINUSE → port taken, else bindable. */
function checkPort(port: number): Promise<CheckResult> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      if (err.code === 'EADDRINUSE') {
        resolve({ name: `port ${port}`, ok: false, detail: `port ${port} is already in use` });
      } else {
        resolve({ name: `port ${port}`, ok: false, detail: `bind failed: ${err.message}` });
      }
    });
    server.once('listening', () => {
      server.close(() => {
        resolve({ name: `port ${port}`, ok: true, detail: `port ${port} is free` });
      });
    });
    server.listen(port, '127.0.0.1');
  });
}

/** Ensure a directory can be created and written to. */
function checkDir(label: string, dir: string): CheckResult {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // Write + delete a sentinel file to confirm we can actually write.
    const sentinel = path.join(dir, `.cuesheet-doctor-${Date.now()}`);
    fs.writeFileSync(sentinel, '');
    fs.unlinkSync(sentinel);
    return { name: label, ok: true, detail: dir };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { name: label, ok: false, detail: `cannot write to ${dir}: ${msg}` };
  }
}

/** Verify that FILE_DIRECTORY is an absolute, resolvable path. */
function checkFileDirectory(resolved: ResolvedValue): CheckResult {
  const name = 'FILE_DIRECTORY';
  if (!resolved.value) {
    return {
      name,
      ok: false,
      detail: `not set (source: ${resolved.source}) — set FILE_DIRECTORY in .env.local`,
    };
  }
  const abs = path.resolve(resolved.value);
  // The directory need not exist yet (it's created on first supervisor run), but
  // we can at least check the path is syntactically valid and absolute.
  if (!path.isAbsolute(abs)) {
    return { name, ok: false, detail: `${resolved.value} does not resolve to an absolute path` };
  }
  return { name, ok: true, detail: abs };
}

// ---------------------------------------------------------------------------
// Config table printer
// ---------------------------------------------------------------------------

const CONFIG_LABELS: Record<string, string> = {
  STREAMLINK_PATH:      'streamlink',
  FFMPEG_PATH:          'ffmpeg',
  FILE_DIRECTORY:       'file directory',
  SUPERVISOR_HEALTH_PORT: 'sup health port',
  SUPERVISOR_BASE_PORT: 'sup base port',
  SUPERVISOR_MAX_PORTS: 'sup max ports',
  SUPERVISOR_HEALTH_HOST: 'sup health host',
};

function printConfigTable(
  resolved: ReturnType<typeof resolveAll>,
  write: (s: string) => void,
): void {
  write('  Resolved configuration:');
  write('');
  write('  Key                     Value                                    Source');
  write('  ─────────────────────── ──────────────────────────────────────── ──────────');

  const rows: Array<[string, ResolvedValue]> = [
    ['STREAMLINK_PATH',        resolved.STREAMLINK_PATH],
    ['FFMPEG_PATH',            resolved.FFMPEG_PATH],
    ['FILE_DIRECTORY',         resolved.FILE_DIRECTORY],
    ['SUPERVISOR_HEALTH_PORT', resolved.SUPERVISOR_HEALTH_PORT],
    ['SUPERVISOR_BASE_PORT',   resolved.SUPERVISOR_BASE_PORT],
    ['SUPERVISOR_MAX_PORTS',   resolved.SUPERVISOR_MAX_PORTS],
    ['SUPERVISOR_HEALTH_HOST', resolved.SUPERVISOR_HEALTH_HOST],
  ];

  for (const [key, rv] of rows) {
    const label  = (CONFIG_LABELS[key] ?? key).padEnd(23);
    const val    = (rv.value ?? '(unset)').padEnd(40);
    const source = rv.source;
    write(`  ${label} ${val} ${source}`);
  }
  write('');
}

// ---------------------------------------------------------------------------
// Check table printer
// ---------------------------------------------------------------------------

function printChecks(results: CheckResult[], write: (s: string) => void): void {
  write('  Environment checks:');
  write('');
  for (const r of results) {
    const sym  = r.ok ? '✓' : '✗';
    const name = r.name.padEnd(22);
    write(`  ${sym} ${name} ${r.detail}`);
  }
  write('');
}

// ---------------------------------------------------------------------------
// Public run() entry point
// ---------------------------------------------------------------------------

export async function run(_argv: string[], ctx: CommandContext): Promise<void> {
  const { cwd, env, stdout } = ctx;
  const write = (s: string) => stdout.write(s + '\n');

  const resolved = resolveAll({}, env, cwd);

  write('');
  write('  cuesheet doctor');
  write('  ─────────────────────────────────────────────────────────────────');
  write('');

  // Print resolved config table first so even a failing run is informative.
  printConfigTable(resolved, write);

  // Run all checks (async ones in parallel where safe).
  const [portWeb, portSup] = await Promise.all([
    checkPort(3000),
    checkPort(8080),
  ]);

  const checks: CheckResult[] = [
    checkBinary('STREAMLINK_PATH', resolved.STREAMLINK_PATH),
    checkBinary('FFMPEG_PATH',     resolved.FFMPEG_PATH),
    portWeb,
    portSup,
    checkDir('data dir',      dataDir(env)),
    checkDir('log dir',       logDir(env)),
    checkDir('run-state dir', path.dirname(runStatePath(env))),
    checkFileDirectory(resolved.FILE_DIRECTORY),
  ];

  printChecks(checks, write);

  // Find the first failure (AC10: print first missing dep, exit 3).
  const firstFail = checks.find((c) => !c.ok);
  if (firstFail) {
    write(`  FAIL: ${firstFail.detail}`);
    write('');
    throw new CliError(firstFail.detail, EXIT.DEP_MISSING);
  }

  write('  All checks passed.');
  write('');
}
