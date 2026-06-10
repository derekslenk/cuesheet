/**
 * Smoke-test the compiled SUPERVISOR binary (dist/supervisor[.exe]).
 *
 * smokeBinary.mjs covers the cuesheet CLI and deliberately never starts the
 * supervisor; this script covers the daemon artifact that actually ships to
 * the OBS host: build it, boot it against a throwaway database, and prove it
 * serves GET /health before tearing it down.
 *
 * Steps:
 *   1. `npm run supervisor:build` — a compile failure of index.bun.ts (which
 *      tsc does not type-check) fails the smoke right here.
 *   2. Seed a temp FILE_DIRECTORY with an empty `smoke_streams` table in
 *      sources.db (via `bun -e` + bun:sqlite — bun is already required for
 *      the build), so the supervisor boots with zero streams and never needs
 *      streamlink/ffmpeg on PATH.
 *   3. Spawn the binary on an ephemeral health port and poll GET /health
 *      until HTTP 200 (bounded retries), then terminate the child.
 *
 * Advisory/non-blocking pre-event: run locally before merging supervisor
 * changes (see RUNBOOK T-60). Promoted into CI as-is by PR-2a of the
 * remediation plan (continue-on-error first, required after two green runs).
 */
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const isWin = process.platform === 'win32';
const RETRIES = 40;
const RETRY_DELAY_MS = 250;

function log(line) {
  console.log(`supervisor-smoke: ${line}`);
}

function fail(line) {
  console.error(`supervisor-smoke: ✗ ${line}`);
  process.exitCode = 1;
}

// 1) Build — this alone catches index.bun.ts compile/bundle failures, which
// nothing else gates today (the file is excluded from tsc).
log('building (npm run supervisor:build)…');
// Single command string + shell: npm is a .cmd shim on Windows, and the
// string form avoids node's DEP0190 args-with-shell warning.
const build = spawnSync('npm run supervisor:build', {
  encoding: 'utf8',
  shell: true,
});
if (build.status !== 0) {
  console.error(build.stdout ?? '');
  console.error(build.stderr ?? '');
  fail(`supervisor:build failed (exit ${build.status})`);
  process.exit(1);
}
log('✓ build succeeded');

// bun appends .exe on Windows regardless of --outfile.
const bin = path.resolve('dist', isWin ? 'supervisor.exe' : 'supervisor');
if (!existsSync(bin)) {
  fail(`built binary not found at ${bin}`);
  process.exit(1);
}

// 2) Throwaway environment: temp FILE_DIRECTORY with an empty streams table.
const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'sup-smoke-'));
mkdirSync(path.join(tmpDir, 'logs'), { recursive: true });
// Seed via a temp script file run by bun directly (bun is a real executable,
// no shell shim needed — and shell quoting mangles multi-line -e args on win).
const seedScript = path.join(tmpDir, 'seed.mjs');
writeFileSync(
  seedScript,
  [
    "import { Database } from 'bun:sqlite';",
    'const db = new Database(process.argv[2]);',
    "db.run('CREATE TABLE smoke_streams (id INTEGER PRIMARY KEY AUTOINCREMENT, obs_source_name TEXT, url TEXT, disabled INTEGER DEFAULT 0)');",
    'db.close();',
  ].join('\n'),
);
const seed = spawnSync('bun', [seedScript, path.join(tmpDir, 'sources.db')], {
  encoding: 'utf8',
});
if (seed.status !== 0) {
  console.error(seed.stderr ?? '');
  fail(`temp db seed failed (exit ${seed.status})`);
  process.exit(1);
}

// 3) Ephemeral free port for /health.
const healthPort = await new Promise((resolve, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address();
    probe.close(() => resolve(port));
  });
});

log(`starting ${path.basename(bin)} on health port ${healthPort}…`);
const child = spawn(bin, [], {
  env: {
    ...process.env,
    FILE_DIRECTORY: tmpDir,
    STREAMS_TABLE: 'smoke_streams',
    SUPERVISOR_HEALTH_PORT: String(healthPort),
    SUPERVISOR_LOG_DIR: path.join(tmpDir, 'logs'),
    // Intentionally bypasses the single-instance guard path so the smoke
    // never reclaims/kills a real supervisor or touches run-state.json. The
    // guard is unit-tested in supervisorGuard.test.ts.
    SUPERVISOR_PORT_GUARD: 'off',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let childOutput = '';
child.stdout.on('data', (c) => { childOutput += c; });
child.stderr.on('data', (c) => { childOutput += c; });
let childExited = false;
child.on('exit', () => { childExited = true; });

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

let healthOk = false;
for (let i = 0; i < RETRIES && !childExited; i++) {
  await delay(RETRY_DELAY_MS);
  try {
    const res = await fetch(`http://127.0.0.1:${healthPort}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (res.status === 200) {
      const body = await res.json();
      log(`✓ GET /health → 200 (status: ${body?.status ?? 'unknown'})`);
      healthOk = true;
      break;
    }
    fail(`GET /health → ${res.status} (expected 200)`);
    break;
  } catch {
    // not listening yet — retry
  }
}

if (!healthOk) {
  fail(
    childExited
      ? 'supervisor exited before /health came up'
      : `GET /health never returned 200 within ${(RETRIES * RETRY_DELAY_MS) / 1000}s`,
  );
  if (childOutput) console.error(`--- supervisor output ---\n${childOutput}`);
}

// Teardown: SIGTERM is handled for a graceful exit on POSIX; on Windows
// child.kill() hard-terminates — either way the smoke only asserts /health.
child.kill('SIGTERM');
await Promise.race([new Promise((r) => child.once('exit', r)), delay(3000)]);
if (!childExited) child.kill('SIGKILL');
try {
  rmSync(tmpDir, { recursive: true, force: true });
} catch {
  // best-effort cleanup (Windows can hold log handles briefly)
}

if (process.exitCode) {
  console.error(`supervisor-smoke: FAILED for ${bin}`);
} else {
  log(`all checks passed for ${bin}`);
}
