import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join, dirname } from 'path';
import { runConversion } from '../runConversion';

function writeScene(path: string, sources: Array<Record<string, unknown>>): void {
  writeFileSync(path, JSON.stringify({ name: 'SaT', sources }, null, 2));
}

const browserSource = (name: string, url: string) => ({
  prev_ver: 536936450,
  name,
  uuid: 'uuid-' + name,
  id: 'browser_source',
  versioned_id: 'browser_source',
  settings: { url, width: 1920, height: 1080, control_audio: true },
  mixers: 255,
  muted: true,
});

describe('runConversion', () => {
  let dir: string;
  let sceneFile: string;
  let backupRoot: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'cbm-run-'));
    sceneFile = join(dir, 'SaT.json');
    backupRoot = join(dir, 'backups');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('happy path: backs up, converts, writes the new JSON back', async () => {
    writeScene(sceneFile, [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')]);
    const exec = jest.fn().mockResolvedValue({
      stdout: 'INFO: No tasks are running which match the specified criteria.\r\n',
      stderr: '',
    });

    const summary = await runConversion({
      sceneFile,
      backupRoot,
      mapping: { team_alpha_main: 'udp://127.0.0.1:9001' },
      timestamp: '2026-05-20T17-30-00',
      exec,
      platform: 'win32',
    });

    expect(summary.changes).toHaveLength(1);
    expect(summary.backupPath).toBe(
      join(backupRoot, 'scenes.backup.2026-05-20T17-30-00', 'SaT.json')
    );

    const written = JSON.parse(readFileSync(sceneFile, 'utf8'));
    expect(written.sources[0].id).toBe('ffmpeg_source');
    expect(written.sources[0].settings.input).toBe('udp://127.0.0.1:9001');

    const backed = JSON.parse(readFileSync(summary.backupPath!, 'utf8'));
    expect(backed.sources[0].id).toBe('browser_source');
  });

  it('refuses to run if OBS is detected as running', async () => {
    writeScene(sceneFile, [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')]);
    const exec = jest.fn().mockResolvedValue({
      stdout: '"obs64.exe","12345","Console","1","123,456 K"\r\n',
      stderr: '',
    });

    await expect(
      runConversion({
        sceneFile,
        backupRoot,
        mapping: { team_alpha_main: 'udp://127.0.0.1:9001' },
        timestamp: 'x',
        exec,
        platform: 'win32',
      })
    ).rejects.toThrow(/OBS .* running/i);

    // Scene file untouched, no backup created
    const after = JSON.parse(readFileSync(sceneFile, 'utf8'));
    expect(after.sources[0].id).toBe('browser_source');
    expect(existsSync(backupRoot)).toBe(false);
  });

  it('dry-run: skips OBS check, writes .diff.json, does NOT mutate the scene or create a backup', async () => {
    writeScene(sceneFile, [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')]);
    const before = readFileSync(sceneFile, 'utf8');
    const exec = jest.fn(); // should not be called

    const summary = await runConversion({
      sceneFile,
      backupRoot,
      mapping: { team_alpha_main: 'udp://127.0.0.1:9001' },
      timestamp: '2026-05-20T17-30-00',
      exec,
      platform: 'win32',
      dryRun: true,
    });

    expect(exec).not.toHaveBeenCalled();
    expect(readFileSync(sceneFile, 'utf8')).toBe(before);
    expect(existsSync(backupRoot)).toBe(false);
    expect(summary.backupPath).toBeUndefined();

    const diffPath = join(dirname(sceneFile), 'SaT.diff.json');
    expect(existsSync(diffPath)).toBe(true);
    const diff = JSON.parse(readFileSync(diffPath, 'utf8'));
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]).toMatchObject({
      name: 'team_alpha_main',
      before: { id: 'browser_source' },
      after: { id: 'ffmpeg_source', input: 'udp://127.0.0.1:9001' },
    });
  });

  it('warns about (but does not fail on) browser_sources without a UDP mapping', async () => {
    writeScene(sceneFile, [
      browserSource('team_alpha_main', 'https://twitch.tv/team_alpha'),
      browserSource('team_beta_main', 'https://twitch.tv/team_beta'),
    ]);
    const exec = jest.fn().mockResolvedValue({
      stdout: 'INFO: No tasks are running which match the specified criteria.\r\n',
      stderr: '',
    });

    const summary = await runConversion({
      sceneFile,
      backupRoot,
      mapping: { team_alpha_main: 'udp://127.0.0.1:9001' },
      timestamp: '2026-05-20T17-30-00',
      exec,
      platform: 'win32',
    });

    expect(summary.warnings).toEqual([
      { name: 'team_beta_main', reason: 'no UDP mapping provided' },
    ]);
    expect(summary.changes).toHaveLength(1);
  });

  it('refuses to run if mapping has zero entries (operator misconfigured)', async () => {
    writeScene(sceneFile, [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')]);
    const exec = jest.fn();

    await expect(
      runConversion({
        sceneFile,
        backupRoot,
        mapping: {},
        timestamp: 'x',
        exec,
        platform: 'win32',
      })
    ).rejects.toThrow(/mapping is empty/);
    expect(exec).not.toHaveBeenCalled();
  });
});
