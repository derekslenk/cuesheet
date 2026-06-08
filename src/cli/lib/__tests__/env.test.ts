/**
 * Tests for src/cli/lib/env.ts
 *
 * All tests are hermetic: they inject synthetic env/cwd/envLocal instead of
 * reading the real machine environment or filesystem.  CUESHEET_HOME / tmp
 * dirs keep any incidental fs I/O outside the real tree.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { resolve, resolveAll, buildChildEnv } from '../env';
import type { ConfigFlags } from '../env';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Make a minimal ProcessEnv with only the supplied keys set. */
function mkEnv(vars: Record<string, string> = {}): NodeJS.ProcessEnv {
  return vars as unknown as NodeJS.ProcessEnv;
}

/** Create a real temp dir and write a .env.local file there.  Returns cwd. */
function makeTmpCwd(lines: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-env-test-'));
  fs.writeFileSync(path.join(dir, '.env.local'), lines.join('\n'), 'utf8');
  return dir;
}

// ---------------------------------------------------------------------------
// resolve() — single-key precedence
// ---------------------------------------------------------------------------

describe('resolve() precedence ordering', () => {
  const KEY = 'STREAMLINK_PATH';

  it('flag beats env, .env.local, and default', () => {
    const result = resolve(KEY, {
      flag: '/from-flag',
      env: mkEnv({ [KEY]: '/from-env' }),
      envLocal: { [KEY]: '/from-file' },
      builtinDefault: () => ({ value: '/from-default', source: 'default' }),
    });
    expect(result).toEqual({ value: '/from-flag', source: 'flag' });
  });

  it('env beats .env.local and default when no flag', () => {
    const result = resolve(KEY, {
      env: mkEnv({ [KEY]: '/from-env' }),
      envLocal: { [KEY]: '/from-file' },
      builtinDefault: () => ({ value: '/from-default', source: 'default' }),
    });
    expect(result).toEqual({ value: '/from-env', source: 'env' });
  });

  it('.env.local beats default when no flag or env', () => {
    const result = resolve(KEY, {
      env: mkEnv(),
      envLocal: { [KEY]: '/from-file' },
      builtinDefault: () => ({ value: '/from-default', source: 'default' }),
    });
    expect(result).toEqual({ value: '/from-file', source: '.env.local' });
  });

  it('default wins when no flag, env, or .env.local entry', () => {
    const result = resolve(KEY, {
      env: mkEnv(),
      envLocal: {},
      builtinDefault: () => ({ value: '/from-default', source: 'default' }),
    });
    expect(result).toEqual({ value: '/from-default', source: 'default' });
  });

  it('returns unset when nothing matches', () => {
    const result = resolve(KEY, {
      env: mkEnv(),
      envLocal: {},
    });
    expect(result).toEqual({ value: undefined, source: 'unset' });
  });

  it('empty string flag is treated as absent (falls through to env)', () => {
    const result = resolve(KEY, {
      flag: '',
      env: mkEnv({ [KEY]: '/from-env' }),
      envLocal: {},
    });
    expect(result).toEqual({ value: '/from-env', source: 'env' });
  });

  it('empty string env value is treated as absent (falls through to .env.local)', () => {
    const result = resolve(KEY, {
      env: mkEnv({ [KEY]: '' }),
      envLocal: { [KEY]: '/from-file' },
    });
    expect(result).toEqual({ value: '/from-file', source: '.env.local' });
  });

  it('reports PATH source when builtinDefault returns PATH', () => {
    const result = resolve(KEY, {
      env: mkEnv(),
      envLocal: {},
      builtinDefault: () => ({ value: '/usr/bin/streamlink', source: 'PATH' }),
    });
    expect(result).toEqual({ value: '/usr/bin/streamlink', source: 'PATH' });
  });
});

// ---------------------------------------------------------------------------
// resolve() — .env.local file parsing
// ---------------------------------------------------------------------------

describe('resolve() .env.local file parsing', () => {
  let tmpDir: string;

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('reads KEY=VALUE from the file when envLocal is not pre-supplied', () => {
    tmpDir = makeTmpCwd(['STREAMLINK_PATH=/parsed-from-file']);
    const result = resolve('STREAMLINK_PATH', {
      env: mkEnv(),
      cwd: tmpDir,
    });
    expect(result).toEqual({ value: '/parsed-from-file', source: '.env.local' });
  });

  it('ignores # comment lines', () => {
    tmpDir = makeTmpCwd(['# this is a comment', 'STREAMLINK_PATH=/real-value']);
    const result = resolve('STREAMLINK_PATH', { env: mkEnv(), cwd: tmpDir });
    expect(result).toEqual({ value: '/real-value', source: '.env.local' });
  });

  it('strips surrounding double-quotes from values', () => {
    tmpDir = makeTmpCwd(['STREAMLINK_PATH="/quoted/value"']);
    const result = resolve('STREAMLINK_PATH', { env: mkEnv(), cwd: tmpDir });
    expect(result.value).toBe('/quoted/value');
  });

  it('strips surrounding single-quotes from values', () => {
    tmpDir = makeTmpCwd(["STREAMLINK_PATH='/sq/value'"]);
    const result = resolve('STREAMLINK_PATH', { env: mkEnv(), cwd: tmpDir });
    expect(result.value).toBe('/sq/value');
  });

  it('returns unset when .env.local does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-env-nofile-'));
    const result = resolve('STREAMLINK_PATH', { env: mkEnv(), cwd: tmpDir });
    expect(result).toEqual({ value: undefined, source: 'unset' });
  });
});

// ---------------------------------------------------------------------------
// resolveAll() — all keys, with injected env/cwd
// ---------------------------------------------------------------------------

describe('resolveAll() supervisor defaults', () => {
  it('provides correct default values for all supervisor knobs', () => {
    const cfg = resolveAll({}, mkEnv(), os.tmpdir());
    expect(cfg.SUPERVISOR_HEALTH_PORT).toEqual({ value: '8080', source: 'default' });
    expect(cfg.SUPERVISOR_BASE_PORT).toEqual({ value: '9001', source: 'default' });
    expect(cfg.SUPERVISOR_MAX_PORTS).toEqual({ value: '8', source: 'default' });
    expect(cfg.SUPERVISOR_HEALTH_HOST).toEqual({ value: '127.0.0.1', source: 'default' });
  });

  it('env overrides supervisor defaults', () => {
    const env = mkEnv({
      SUPERVISOR_HEALTH_PORT: '9090',
      SUPERVISOR_BASE_PORT: '10000',
      SUPERVISOR_MAX_PORTS: '4',
      SUPERVISOR_HEALTH_HOST: '0.0.0.0',
    });
    const cfg = resolveAll({}, env, os.tmpdir());
    expect(cfg.SUPERVISOR_HEALTH_PORT).toEqual({ value: '9090', source: 'env' });
    expect(cfg.SUPERVISOR_BASE_PORT).toEqual({ value: '10000', source: 'env' });
    expect(cfg.SUPERVISOR_MAX_PORTS).toEqual({ value: '4', source: 'env' });
    expect(cfg.SUPERVISOR_HEALTH_HOST).toEqual({ value: '0.0.0.0', source: 'env' });
  });

  it('flag overrides env for supervisor knobs', () => {
    const env = mkEnv({ SUPERVISOR_HEALTH_PORT: '9090' });
    const flags: ConfigFlags = { supervisorHealthPort: '7777' };
    const cfg = resolveAll(flags, env, os.tmpdir());
    expect(cfg.SUPERVISOR_HEALTH_PORT).toEqual({ value: '7777', source: 'flag' });
  });
});

describe('resolveAll() path keys read from .env.local', () => {
  let tmpDir: string;

  afterEach(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  it('resolves STREAMLINK_PATH from .env.local with correct source', () => {
    tmpDir = makeTmpCwd(['STREAMLINK_PATH=/custom/streamlink']);
    const cfg = resolveAll({}, mkEnv(), tmpDir);
    expect(cfg.STREAMLINK_PATH).toEqual({ value: '/custom/streamlink', source: '.env.local' });
  });

  it('resolves FILE_DIRECTORY from .env.local', () => {
    tmpDir = makeTmpCwd(['FILE_DIRECTORY=/my/obs/dir']);
    const cfg = resolveAll({}, mkEnv(), tmpDir);
    expect(cfg.FILE_DIRECTORY).toEqual({ value: '/my/obs/dir', source: '.env.local' });
  });

  it('flag beats .env.local for path keys', () => {
    tmpDir = makeTmpCwd(['STREAMLINK_PATH=/from-file']);
    const cfg = resolveAll({ streamlinkPath: '/from-flag' }, mkEnv(), tmpDir);
    expect(cfg.STREAMLINK_PATH).toEqual({ value: '/from-flag', source: 'flag' });
  });

  it('env beats .env.local for path keys', () => {
    tmpDir = makeTmpCwd(['STREAMLINK_PATH=/from-file']);
    const cfg = resolveAll({}, mkEnv({ STREAMLINK_PATH: '/from-env' }), tmpDir);
    expect(cfg.STREAMLINK_PATH).toEqual({ value: '/from-env', source: 'env' });
  });
});

// ---------------------------------------------------------------------------
// buildChildEnv()
// ---------------------------------------------------------------------------

describe('buildChildEnv()', () => {
  it('merges resolved values onto a base env', () => {
    const cfg = resolveAll(
      {
        streamlinkPath: '/sl',
        ffmpegPath: '/ff',
        fileDirectory: '/fd',
        supervisorHealthPort: '8080',
        supervisorBasePort: '9001',
        supervisorMaxPorts: '8',
        supervisorHealthHost: '127.0.0.1',
      },
      mkEnv(),
      os.tmpdir(),
    );
    const base = mkEnv({ EXISTING: 'preserved' });
    const out = buildChildEnv(cfg, base);

    expect(out.EXISTING).toBe('preserved');
    expect(out.STREAMLINK_PATH).toBe('/sl');
    expect(out.FFMPEG_PATH).toBe('/ff');
    expect(out.FILE_DIRECTORY).toBe('/fd');
    expect(out.SUPERVISOR_HEALTH_PORT).toBe('8080');
    expect(out.SUPERVISOR_BASE_PORT).toBe('9001');
    expect(out.SUPERVISOR_MAX_PORTS).toBe('8');
    expect(out.SUPERVISOR_HEALTH_HOST).toBe('127.0.0.1');
  });

  it('does not include keys whose value is undefined', () => {
    // Produce a config where STREAMLINK_PATH is unset (no flag/env/file/default mock)
    // We test by directly constructing the resolved config shape
    const cfg = resolveAll({}, mkEnv(), os.tmpdir());
    // Override STREAMLINK_PATH to unset for this test by producing a fake cfg
    const fakeCfg = {
      ...cfg,
      STREAMLINK_PATH: { value: undefined, source: 'unset' as const },
    };
    const out = buildChildEnv(fakeCfg, mkEnv());
    expect(Object.prototype.hasOwnProperty.call(out, 'STREAMLINK_PATH')).toBe(false);
  });

  it('does not mutate the base env object', () => {
    const base = mkEnv({ ORIGINAL: 'untouched' });
    const cfg = resolveAll({ streamlinkPath: '/sl' }, mkEnv(), os.tmpdir());
    buildChildEnv(cfg, base);
    expect(base.STREAMLINK_PATH).toBeUndefined();
  });
});
