/**
 * Tests for the on-demand HLS preview packager — focused on the new C1
 * concurrency cap, session reuse, and stopPreview cleanup (S4 path).
 *
 * child_process/fs are mocked at the boundary so no ffmpeg is ever spawned and
 * no temp dirs are touched. PREVIEW_MAX_CONCURRENT is set low so the cap is
 * cheap to exercise. The module keeps state in a module-level Map, so each test
 * re-imports it fresh via jest.isolateModules.
 */

process.env.PREVIEW_MAX_CONCURRENT = '3';
process.env.PREVIEW_IDLE_MS = '50';

// A minimal fake ChildProcess: alive (exitCode/signalCode null), records kill().
function makeProc() {
  return {
    exitCode: null as number | null,
    signalCode: null as string | null,
    on: jest.fn(),
    stderr: { on: jest.fn() },
    kill: jest.fn(),
  };
}

const spawnMock = jest.fn(() => makeProc());
const mkdirSyncMock = jest.fn();
const rmSyncMock = jest.fn();

// The mocks ignore call args (the tests assert call counts/results, not args),
// which keeps the wrappers free of unused-parameter lint noise.
jest.mock('child_process', () => ({ spawn: () => spawnMock() }));
jest.mock('fs', () => ({ mkdirSync: () => mkdirSyncMock(), rmSync: () => rmSyncMock() }));

type PM = typeof import('../previewManager');
function freshModule(): PM {
  let mod!: PM;
  jest.isolateModules(() => {
    mod = require('../previewManager');
  });
  return mod;
}

beforeEach(() => {
  spawnMock.mockClear();
  mkdirSyncMock.mockClear();
  rmSyncMock.mockClear();
});

describe('previewManager — C1 concurrency cap', () => {
  it('spawns one packager per distinct stream id up to the cap', () => {
    const pm = freshModule();
    pm.ensurePreview(1);
    pm.ensurePreview(2);
    pm.ensurePreview(3);
    expect(spawnMock).toHaveBeenCalledTimes(3);
  });

  it('throws PreviewCapacityError when the cap is exceeded', () => {
    const pm = freshModule();
    pm.ensurePreview(1);
    pm.ensurePreview(2);
    pm.ensurePreview(3);
    expect(() => pm.ensurePreview(4)).toThrow(pm.PreviewCapacityError);
    expect(spawnMock).toHaveBeenCalledTimes(3); // no 4th spawn
  });

  it('reuses an existing session — the same id does not consume a second slot', () => {
    const pm = freshModule();
    pm.ensurePreview(1);
    pm.ensurePreview(1); // reuse, not a new spawn
    expect(spawnMock).toHaveBeenCalledTimes(1);
    // slots 2 and 3 still available
    pm.ensurePreview(2);
    pm.ensurePreview(3);
    expect(() => pm.ensurePreview(4)).toThrow(pm.PreviewCapacityError);
  });

  it('frees a slot after stopPreview so a new id can start', () => {
    const pm = freshModule();
    pm.ensurePreview(1);
    pm.ensurePreview(2);
    pm.ensurePreview(3);
    pm.stopPreview(1);                 // release one
    expect(() => pm.ensurePreview(4)).not.toThrow();
    expect(spawnMock).toHaveBeenCalledTimes(4);
  });
});

describe('previewManager — stopPreview cleanup (S4 path)', () => {
  it('kills the ffmpeg process and removes its temp dir', () => {
    const pm = freshModule();
    pm.ensurePreview(7);
    const proc = spawnMock.mock.results[0].value as ReturnType<typeof makeProc>;
    pm.stopPreview(7);
    expect(proc.kill).toHaveBeenCalledWith('SIGTERM');
    expect(rmSyncMock).toHaveBeenCalled();
    expect(pm.previewIsRunning(7)).toBe(false);
  });

  it('is a no-op for an unknown id', () => {
    const pm = freshModule();
    expect(() => pm.stopPreview(999)).not.toThrow();
    expect(rmSyncMock).not.toHaveBeenCalled();
  });
});
