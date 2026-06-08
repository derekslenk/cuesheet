import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { dataDir, logDir, runStatePath, logPathFor, findProjectRoot, isProjectRoot } from '../paths';

describe('paths', () => {
  const fakeEnv = { CUESHEET_HOME: path.join('/tmp', 'cuesheet-test') } as unknown as NodeJS.ProcessEnv;

  it('honors CUESHEET_HOME override for the data dir', () => {
    expect(dataDir(fakeEnv)).toBe(path.resolve('/tmp/cuesheet-test'));
  });

  it('derives logDir under the data dir', () => {
    expect(logDir(fakeEnv)).toBe(path.join(dataDir(fakeEnv), 'logs'));
  });

  it('derives run-state.json under the data dir', () => {
    expect(runStatePath(fakeEnv)).toBe(path.join(dataDir(fakeEnv), 'run-state.json'));
  });

  it('derives per-role log paths under logDir', () => {
    expect(logPathFor('sup', fakeEnv)).toBe(path.join(logDir(fakeEnv), 'sup.log'));
  });

  it('falls back to a per-OS location when no override is set', () => {
    const d = dataDir({} as NodeJS.ProcessEnv);
    expect(d).toContain('cuesheet');
    expect(path.isAbsolute(d)).toBe(true);
  });
});

describe('findProjectRoot', () => {
  // Build a fake project: <root>/{package.json, node_modules/, app/, dist/}
  let root: string;
  beforeAll(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'cuesheet-root-'));
    fs.writeFileSync(path.join(root, 'package.json'), '{}');
    fs.mkdirSync(path.join(root, 'node_modules'));
    fs.mkdirSync(path.join(root, 'app'));
    fs.mkdirSync(path.join(root, 'dist'));
  });
  afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

  const noEnv = {} as NodeJS.ProcessEnv;

  it('recognizes a valid project root', () => {
    expect(isProjectRoot(root)).toBe(true);
    expect(isProjectRoot(path.join(root, 'dist'))).toBe(false);
  });

  it('walks UP from a subdirectory (e.g. running from dist/)', () => {
    expect(findProjectRoot([path.join(root, 'dist')], noEnv)).toBe(path.resolve(root));
  });

  it('honors the CUESHEET_PROJECT_ROOT override', () => {
    const env = { CUESHEET_PROJECT_ROOT: root } as unknown as NodeJS.ProcessEnv;
    expect(findProjectRoot(['/nowhere/at/all'], env)).toBe(root);
  });

  it('returns null when no root is found', () => {
    expect(findProjectRoot([os.tmpdir()], noEnv)).toBeNull();
  });
});
