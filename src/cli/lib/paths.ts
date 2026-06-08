/**
 * THE single authority for where `cuesheet` keeps its on-disk state.
 *
 * Every command resolves data/log/run-state locations through here so behavior
 * is identical across Windows, macOS, and Linux and there are no scattered
 * path assumptions. Override the base directory with CUESHEET_HOME.
 *
 * Layout:
 *   <dataDir>/                 base state dir (per-OS)
 *   <dataDir>/run-state.json   managed process records
 *   <dataDir>/logs/<role>.log  per-process detached logs
 */
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** Resolve the per-OS base data directory (respects CUESHEET_HOME override). */
export function dataDir(env: NodeJS.ProcessEnv = process.env): string {
  const override = env.CUESHEET_HOME;
  if (override && override.trim() !== '') return path.resolve(override);

  const home = os.homedir();
  switch (process.platform) {
    case 'win32': {
      const base = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
      return path.join(base, 'cuesheet');
    }
    case 'darwin':
      return path.join(home, 'Library', 'Application Support', 'cuesheet');
    default: {
      const base = env.XDG_STATE_HOME || path.join(home, '.local', 'state');
      return path.join(base, 'cuesheet');
    }
  }
}

export function logDir(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), 'logs');
}

export function runStatePath(env: NodeJS.ProcessEnv = process.env): string {
  return path.join(dataDir(env), 'run-state.json');
}

export function logPathFor(role: string, env: NodeJS.ProcessEnv = process.env): string {
  return path.join(logDir(env), `${role}.log`);
}

/** Ensure a directory exists (recursive, idempotent). Returns the dir. */
export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Ensure data + log dirs exist. Call once at command start when writing state. */
export function ensureStateDirs(env: NodeJS.ProcessEnv = process.env): void {
  ensureDir(dataDir(env));
  ensureDir(logDir(env));
}

/**
 * Resolve an asset (e.g. dashboard.html) relative to the source tree at dev
 * time. In a `bun --compile` binary, prefer embedding the asset via an import
 * attribute (see scripts/streamlink-supervisor/index.bun.ts) — this helper is
 * only the dev/tsx fallback.
 */
export function assetPath(...segments: string[]): string {
  return path.resolve(process.cwd(), ...segments);
}

/**
 * A directory is the CueSheet project root if it has `package.json` +
 * `node_modules` and a Next.js marker (`app/` or a `next.config.*`).
 */
export function isProjectRoot(dir: string): boolean {
  const has = (p: string) => fs.existsSync(path.join(dir, p));
  return (
    has('package.json') &&
    has('node_modules') &&
    (has('app') || has('next.config.ts') || has('next.config.js') || has('next.config.mjs'))
  );
}

/**
 * Locate the CueSheet project root — the directory `next dev` MUST run in (it
 * needs `app/` + `node_modules` + `package.json`). This lets the binary be
 * invoked from anywhere (e.g. the `dist/` folder, where the user naturally runs
 * `dist\cuesheet.exe`), not just the repo root.
 *
 * Resolution order:
 *   1. `CUESHEET_PROJECT_ROOT` env override (if it points at a real root).
 *   2. Walk upward from each of `startDirs` (typically the cwd, then the
 *      binary's OWN directory `dirname(process.execPath)`) looking for a marker.
 *
 * Returns the absolute path, or `null` if none is found.
 */
export function findProjectRoot(
  startDirs: Array<string | undefined>,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const override = env.CUESHEET_PROJECT_ROOT;
  if (override && override.trim() !== '') {
    const dir = path.resolve(override);
    if (isProjectRoot(dir)) return dir;
  }
  for (const start of startDirs) {
    if (!start) continue;
    let dir = path.resolve(start);
    for (;;) {
      if (isProjectRoot(dir)) return dir;
      const parent = path.dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  }
  return null;
}
