/**
 * Smoke-test a compiled `cuesheet` binary. Cross-platform: picks the right
 * artifact for the host OS, runs the read-only subcommands, and asserts
 * exit codes + output shape. Used by the binary CI matrix (one run per OS)
 * and runnable locally after `npm run binary:build:<target>`.
 *
 * Checks:
 *   cuesheet --help        → exit 0, mentions all subcommands
 *   cuesheet status --json → valid JSON array (exit 0 when up / 1 when down)
 *   cuesheet doctor        → exit 0 (deps present) or 3 (a dep missing)
 *
 * Does NOT start long-running services (dev/sup) — those need next/db and a
 * real environment; the dedicated lifecycle test covers start→status→stop.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const BINARIES = {
  win32: 'cuesheet.exe',
  darwin: 'cuesheet-macos',
  linux: 'cuesheet-linux',
};

const bin = path.resolve('dist', BINARIES[process.platform] ?? 'cuesheet');
if (!existsSync(bin)) {
  console.error(`smoke: binary not found at ${bin} — build it first (npm run binary:build:*)`);
  process.exit(1);
}

let failures = 0;
function check(name, cond, detail = '') {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    console.error(`  ✗ ${name} ${detail}`);
    failures++;
  }
}

function run(args) {
  return spawnSync(bin, args, { encoding: 'utf8' });
}

// 1) --help
const help = run(['--help']);
check('--help exits 0', help.status === 0, `(exit ${help.status})`);
check(
  '--help lists core subcommands',
  ['dev', 'sup', 'watch', 'status', 'start', 'stop', 'gui', 'doctor'].every((c) =>
    help.stdout.includes(c),
  ),
);

// 2) status --json
const status = run(['status', '--json']);
check('status --json exits 0 or 1', status.status === 0 || status.status === 1, `(exit ${status.status})`);
let parsed;
try {
  parsed = JSON.parse(status.stdout);
} catch {
  parsed = null;
}
check('status --json emits a JSON array', Array.isArray(parsed));
check(
  'status --json includes sup + web rows',
  Array.isArray(parsed) && parsed.some((r) => r.service === 'sup') && parsed.some((r) => r.service === 'web'),
);

// 3) doctor
const doctor = run(['doctor']);
check('doctor exits 0 or 3', doctor.status === 0 || doctor.status === 3, `(exit ${doctor.status})`);

console.log('');
if (failures > 0) {
  console.error(`smoke: ${failures} check(s) FAILED for ${bin}`);
  process.exit(1);
}
console.log(`smoke: all checks passed for ${bin}`);
