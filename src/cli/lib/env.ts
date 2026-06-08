/**
 * Config-precedence resolver for the `cuesheet` CLI.
 *
 * Precedence (highest wins):
 *   1. Explicit CLI flag value
 *   2. process.env (or the injected env from CommandContext)
 *   3. .env.local in the working directory (parsed without dotenv)
 *   4. Per-OS built-in default
 *      - win32: hardcoded paths matching run-dev.cmd / run-sup.cmd
 *      - POSIX: PATH lookup for tools; sensible directory default
 *
 * Every resolved value carries a `source` tag so `doctor` can explain
 * where each setting came from.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { findProjectRoot } from './paths.js';
import type { ResolvedValue } from './types.js';

// ---------------------------------------------------------------------------
// Windows built-in defaults (mirrors run-dev.cmd / run-sup.cmd exactly)
// ---------------------------------------------------------------------------

const WIN32_DEFAULTS = {
  STREAMLINK_PATH: 'C:\\Users\\derek\\scoop\\apps\\streamlink\\8.4.0-1\\bin\\streamlink.exe',
  FFMPEG_PATH: 'C:\\Users\\derek\\scoop\\apps\\ffmpeg\\8.1.1\\bin\\ffmpeg.exe',
  FILE_DIRECTORY: 'C:/OBS/source-switching',
} as const;

// ---------------------------------------------------------------------------
// .env.local parser  (KEY=VALUE lines; # comments; no multiline/quoting edge
// cases — just enough for the thin env files used here)
// ---------------------------------------------------------------------------

/** Parse a .env.local file into a plain object.  Returns {} on any error. */
function parseEnvLocal(filePath: string): Record<string, string> {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    // Strip optional surrounding quotes from value
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (key) result[key] = val;
  }
  return result;
}

/**
 * Load .env.local (then .env) from the resolved project root into `env`,
 * filling ONLY keys not already set — so real environment values (and Bun's cwd
 * auto-load) still win, matching Next's precedence. Mirrors
 * scripts/streamlink-supervisor/loadEnv.ts, but anchored to findProjectRoot
 * instead of cwd / import.meta.url, so a supervisor launched from a non-project
 * directory (e.g. dist/) still sees EVENT_KEY / FILE_DIRECTORY and can't drift
 * from the webui's event tables. No-op when no project root is found (truly
 * standalone — rely on the real environment).
 */
export function loadProjectEnvFiles(
  env: NodeJS.ProcessEnv = process.env,
  startDirs: Array<string | undefined> = [
    env.CUESHEET_PROJECT_ROOT,
    process.cwd(),
    path.dirname(process.execPath),
  ],
): void {
  const root = findProjectRoot(startDirs, env);
  if (!root) return;
  // .env.local wins over .env, so load it first; we only fill missing keys.
  for (const name of ['.env.local', '.env']) {
    const parsed = parseEnvLocal(path.join(root, name));
    for (const [key, value] of Object.entries(parsed)) {
      if (env[key] === undefined) env[key] = value;
    }
  }
}

// ---------------------------------------------------------------------------
// PATH lookup (POSIX only)
// ---------------------------------------------------------------------------

/** Try to locate a binary on PATH.  Returns undefined when not found. */
function whichSync(bin: string): string | undefined {
  try {
    const [cmd, args] = process.platform === 'win32'
      ? ['where', [bin]] as const
      : ['which', [bin]] as const;
    const out = execFileSync(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
    // `which`/`where` can return multiple lines; take the first
    const first = out.split(/\r?\n/)[0]?.trim();
    return first || undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------------------
// Core resolver
// ---------------------------------------------------------------------------

/** Options for a single {@link resolve} call. */
export interface ResolveOptions {
  /** Injected process environment (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv;
  /** Working directory used to locate `.env.local` (defaults to `process.cwd()`). */
  cwd?: string;
  /** Explicit CLI flag value (highest precedence). */
  flag?: string;
  /**
   * Per-OS default value factory.
   * Return `{ value, source }` where source is `'default'` or `'PATH'`.
   * When omitted no built-in default is applied.
   */
  builtinDefault?: () => { value: string | undefined; source: 'default' | 'PATH' };
  /**
   * Pre-parsed .env.local contents.  When omitted, the file is read from
   * `cwd`; pass an empty object to skip file I/O (useful in tests).
   */
  envLocal?: Record<string, string>;
}

/**
 * Resolve a single named config key with full precedence.
 *
 * @param name   Environment variable name (e.g. `'STREAMLINK_PATH'`)
 * @param opts   Resolution options (see {@link ResolveOptions})
 */
export function resolve(name: string, opts: ResolveOptions = {}): ResolvedValue {
  const env = opts.env ?? process.env;
  const cwd = opts.cwd ?? process.cwd();
  const envLocal = opts.envLocal ?? parseEnvLocal(path.join(cwd, '.env.local'));

  // 1. Explicit CLI flag
  if (opts.flag !== undefined && opts.flag !== '') {
    return { value: opts.flag, source: 'flag' };
  }

  // 2. process.env
  const fromEnv = env[name];
  if (fromEnv !== undefined && fromEnv !== '') {
    return { value: fromEnv, source: 'env' };
  }

  // 3. .env.local
  const fromFile = envLocal[name];
  if (fromFile !== undefined && fromFile !== '') {
    return { value: fromFile, source: '.env.local' };
  }

  // 4. Per-OS built-in default
  if (opts.builtinDefault) {
    const def = opts.builtinDefault();
    if (def.value !== undefined && def.value !== '') {
      return { value: def.value, source: def.source };
    }
  }

  return { value: undefined, source: 'unset' };
}

// ---------------------------------------------------------------------------
// Platform-aware built-in defaults for each known key
// ---------------------------------------------------------------------------

function win32PathDefault(key: keyof typeof WIN32_DEFAULTS): () => { value: string; source: 'default' } {
  return () => ({ value: WIN32_DEFAULTS[key], source: 'default' });
}

function posixToolDefault(bin: string): () => { value: string | undefined; source: 'PATH' | 'default' } {
  return () => {
    const found = whichSync(bin);
    return found ? { value: found, source: 'PATH' } : { value: undefined, source: 'PATH' };
  };
}

// ---------------------------------------------------------------------------
// High-level: resolve all known keys at once
// ---------------------------------------------------------------------------

/** All config keys the CLI manages. */
export interface ResolvedConfig {
  STREAMLINK_PATH: ResolvedValue;
  FFMPEG_PATH: ResolvedValue;
  FILE_DIRECTORY: ResolvedValue;
  SUPERVISOR_HEALTH_PORT: ResolvedValue;
  SUPERVISOR_BASE_PORT: ResolvedValue;
  SUPERVISOR_MAX_PORTS: ResolvedValue;
  SUPERVISOR_HEALTH_HOST: ResolvedValue;
}

/** Flags the user may have supplied on the CLI for each key. */
export interface ConfigFlags {
  streamlinkPath?: string;
  ffmpegPath?: string;
  fileDirectory?: string;
  supervisorHealthPort?: string;
  supervisorBasePort?: string;
  supervisorMaxPorts?: string;
  supervisorHealthHost?: string;
}

/**
 * Resolve the full set of cuesheet config values with precedence.
 *
 * Pass `flags` when the caller has parsed CLI options already.
 * Pass `env` + `cwd` to override globals (for tests / `CommandContext`).
 */
export function resolveAll(
  flags: ConfigFlags = {},
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): ResolvedConfig {
  // Parse .env.local once and share across all key resolutions
  const envLocal = parseEnvLocal(path.join(cwd, '.env.local'));

  const base: ResolveOptions = { env, cwd, envLocal };

  const isWin32 = process.platform === 'win32';

  return {
    STREAMLINK_PATH: resolve('STREAMLINK_PATH', {
      ...base,
      flag: flags.streamlinkPath,
      builtinDefault: isWin32
        ? win32PathDefault('STREAMLINK_PATH')
        : posixToolDefault('streamlink'),
    }),

    FFMPEG_PATH: resolve('FFMPEG_PATH', {
      ...base,
      flag: flags.ffmpegPath,
      builtinDefault: isWin32
        ? win32PathDefault('FFMPEG_PATH')
        : posixToolDefault('ffmpeg'),
    }),

    FILE_DIRECTORY: resolve('FILE_DIRECTORY', {
      ...base,
      flag: flags.fileDirectory,
      builtinDefault: isWin32
        ? win32PathDefault('FILE_DIRECTORY')
        : () => ({ value: path.join(process.env.HOME ?? '/tmp', 'obs', 'source-switching'), source: 'default' }),
    }),

    SUPERVISOR_HEALTH_PORT: resolve('SUPERVISOR_HEALTH_PORT', {
      ...base,
      flag: flags.supervisorHealthPort,
      builtinDefault: () => ({ value: '8080', source: 'default' }),
    }),

    SUPERVISOR_BASE_PORT: resolve('SUPERVISOR_BASE_PORT', {
      ...base,
      flag: flags.supervisorBasePort,
      builtinDefault: () => ({ value: '9001', source: 'default' }),
    }),

    SUPERVISOR_MAX_PORTS: resolve('SUPERVISOR_MAX_PORTS', {
      ...base,
      flag: flags.supervisorMaxPorts,
      builtinDefault: () => ({ value: '8', source: 'default' }),
    }),

    SUPERVISOR_HEALTH_HOST: resolve('SUPERVISOR_HEALTH_HOST', {
      ...base,
      flag: flags.supervisorHealthHost,
      builtinDefault: () => ({ value: '127.0.0.1', source: 'default' }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Child-process env builder
// ---------------------------------------------------------------------------

/**
 * Build the environment map for a child process (e.g. `next dev`, supervisor).
 *
 * Merges resolved config values onto a base env.  Only keys with a defined
 * `value` are forwarded; `unset` entries are omitted so the child process can
 * apply its own defaults.
 *
 * @param resolved  Output of {@link resolveAll}
 * @param base      Base environment to extend (defaults to `process.env`)
 */
export function buildChildEnv(
  resolved: ResolvedConfig,
  base: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { ...base };
  const entries: Array<[string, ResolvedValue]> = [
    ['STREAMLINK_PATH', resolved.STREAMLINK_PATH],
    ['FFMPEG_PATH', resolved.FFMPEG_PATH],
    ['FILE_DIRECTORY', resolved.FILE_DIRECTORY],
    ['SUPERVISOR_HEALTH_PORT', resolved.SUPERVISOR_HEALTH_PORT],
    ['SUPERVISOR_BASE_PORT', resolved.SUPERVISOR_BASE_PORT],
    ['SUPERVISOR_MAX_PORTS', resolved.SUPERVISOR_MAX_PORTS],
    ['SUPERVISOR_HEALTH_HOST', resolved.SUPERVISOR_HEALTH_HOST],
  ];
  for (const [key, rv] of entries) {
    if (rv.value !== undefined) {
      out[key] = rv.value;
    }
  }
  return out;
}
