/**
 * Build the supervisor binary as a VERSIONED release artifact.
 *
 * `npm run supervisor:build` keeps emitting plain dist/supervisor[.exe] (the
 * dev/smoke contract — smokeSupervisorBinary.mjs depends on that name). This
 * script wraps that build and copies the result to
 * dist/supervisor-v<package.json version>[.exe], so deploys staged to the OBS
 * host (e.g. C:\OBS\supervisor\) carry version traceability instead of
 * overwriting an unversioned binary in place. The binary itself reports the
 * same version on /health (embedded from package.json at compile time via
 * lib/version.ts).
 *
 * Usage: npm run supervisor:build:release
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const { version } = createRequire(import.meta.url)('../package.json');
const isWin = process.platform === 'win32';
const ext = isWin ? '.exe' : '';

function fail(line) {
  console.error(`supervisor-release: ✗ ${line}`);
  process.exit(1);
}

console.log(`supervisor-release: building v${version} (npm run supervisor:build)…`);
// Single command string + shell: npm is a .cmd shim on Windows (same pattern
// as smokeSupervisorBinary.mjs).
const build = spawnSync('npm run supervisor:build', { encoding: 'utf8', shell: true });
if (build.status !== 0) {
  console.error(build.stdout ?? '');
  console.error(build.stderr ?? '');
  fail(`supervisor:build failed (exit ${build.status})`);
}

const built = path.resolve('dist', `supervisor${ext}`);
if (!existsSync(built)) fail(`built binary not found at ${built}`);

const versioned = path.resolve('dist', `supervisor-v${version}${ext}`);
copyFileSync(built, versioned);
console.log(`supervisor-release: ✓ ${versioned}`);
console.log(
  'supervisor-release: stage THIS file on the OBS host and verify GET /health reports ' +
  `"version":"${version}" after switchover.`
);
