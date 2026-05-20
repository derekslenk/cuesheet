import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { backupSceneFile, restoreFromBackup } from '../backup';

describe('backupSceneFile', () => {
  let dir: string;
  let backupRoot: string;
  let sceneFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cbm-'));
    backupRoot = join(dir, 'backups');
    sceneFile = join(dir, 'SaT.json');
    writeFileSync(sceneFile, '{"name":"SaT","sources":[]}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('copies the scene file into scenes.backup.<ISO>/<basename> and returns that path', () => {
    const result = backupSceneFile({
      sceneFile,
      backupRoot,
      timestamp: '2026-05-20T17-30-00',
    });

    expect(result.backupPath).toBe(join(backupRoot, 'scenes.backup.2026-05-20T17-30-00', 'SaT.json'));
    expect(readFileSync(result.backupPath, 'utf8')).toBe('{"name":"SaT","sources":[]}');
  });

  it('creates the timestamped directory if missing', () => {
    backupSceneFile({ sceneFile, backupRoot, timestamp: '2026-05-20T17-30-00' });
    const dirs = readdirSync(backupRoot);
    expect(dirs).toContain('scenes.backup.2026-05-20T17-30-00');
  });

  it('refuses to overwrite an existing backup directory (force false-by-default)', () => {
    backupSceneFile({ sceneFile, backupRoot, timestamp: '2026-05-20T17-30-00' });
    expect(() =>
      backupSceneFile({ sceneFile, backupRoot, timestamp: '2026-05-20T17-30-00' })
    ).toThrow(/already exists/);
  });

  it('throws if the scene file is missing', () => {
    expect(() =>
      backupSceneFile({ sceneFile: join(dir, 'missing.json'), backupRoot, timestamp: 'x' })
    ).toThrow(/not found/);
  });
});

describe('restoreFromBackup', () => {
  let dir: string;
  let backupRoot: string;
  let sceneFile: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cbm-restore-'));
    backupRoot = join(dir, 'backups');
    sceneFile = join(dir, 'SaT.json');
    writeFileSync(sceneFile, '{"name":"SaT","sources":[]}');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('round-trips backup → mutate → restore yields byte-identical content', () => {
    const { backupPath } = backupSceneFile({
      sceneFile,
      backupRoot,
      timestamp: '2026-05-20T17-30-00',
    });
    const original = readFileSync(sceneFile, 'utf8');

    writeFileSync(sceneFile, '{"name":"SaT","sources":[{"id":"converted"}]}');
    restoreFromBackup({ backupPath, sceneFile });

    expect(readFileSync(sceneFile, 'utf8')).toBe(original);
  });

  it('throws if the backup file is missing', () => {
    expect(() =>
      restoreFromBackup({ backupPath: join(backupRoot, 'missing.json'), sceneFile })
    ).toThrow(/not found/);
  });
});
