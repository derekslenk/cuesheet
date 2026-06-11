/**
 * @jest-environment node
 */
import { POST as stopPOST } from '../stop/route';
import { POST as startPOST } from '../start/route';
import { POST as restartPOST } from '../restart/route';

const mockGet = jest.fn();
const mockRun = jest.fn();
jest.mock('../../../../../../lib/database', () => ({
  getDatabase: async () => ({ get: mockGet, run: mockRun }),
}));

const mockRequestStop = jest.fn();
const mockRequestStart = jest.fn();
const mockRequestRestart = jest.fn();
jest.mock('../../../../../../lib/supervisorClient', () => ({
  requestSupervisorStop: (...a: unknown[]) => mockRequestStop(...a),
  requestSupervisorStart: (...a: unknown[]) => mockRequestStart(...a),
  requestSupervisorRestart: (...a: unknown[]) => mockRequestRestart(...a),
}));

// The route handlers read only `params`, not the request — a typed stub suffices.
const fakeReq = {} as never;
const params = (id: string) => ({ params: Promise.resolve({ id }) });

describe('POST /api/supervisor/streams/[id]/stop', () => {
  beforeEach(() => { mockGet.mockReset(); mockRun.mockReset(); mockRequestStop.mockReset(); });

  it('404 when the stream id is unknown', async () => {
    mockGet.mockResolvedValue(undefined);
    const res = await stopPOST(fakeReq, params('999'));
    expect(res.status).toBe(404);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('forwards to supervisor and does NOT write the DB when reachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: true, ok: true });
    const res = await stopPOST(fakeReq, params('1'));
    expect(mockRequestStop).toHaveBeenCalledWith('team_a');
    expect(mockRun).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'stop' });
  });

  it('break-glass: writes disabled=1 + degraded when supervisor unreachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: false, ok: false });
    const res = await stopPOST(fakeReq, params('1'));
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('SET disabled = 1 WHERE id = ?'), ['1']
    );
    const body = await res.json();
    expect(body).toEqual({ success: true, id: '1', action: 'stop', degraded: true });
  });

  it('502 when supervisor is reachable but rejects', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStop.mockResolvedValue({ reachable: true, ok: false });
    const res = await stopPOST(fakeReq, params('1'));
    expect(res.status).toBe(502);
    expect(mockRun).not.toHaveBeenCalled();
  });
});

describe('POST /api/supervisor/streams/[id]/start', () => {
  beforeEach(() => { mockGet.mockReset(); mockRun.mockReset(); mockRequestStart.mockReset(); });

  it('404 when the stream id is unknown', async () => {
    mockGet.mockResolvedValue(undefined);
    const res = await startPOST(fakeReq, params('999'));
    expect(res.status).toBe(404);
    expect(mockRequestStart).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('forwards to supervisor and does NOT write the DB when reachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStart.mockResolvedValue({ reachable: true, ok: true });
    const res = await startPOST(fakeReq, params('1'));
    expect(mockRequestStart).toHaveBeenCalledWith('team_a');
    expect(mockRun).not.toHaveBeenCalled();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'start' });
  });

  it('502 when supervisor is reachable but rejects', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStart.mockResolvedValue({ reachable: true, ok: false });
    const res = await startPOST(fakeReq, params('1'));
    expect(res.status).toBe(502);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('break-glass: writes disabled=0 + degraded when supervisor unreachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestStart.mockResolvedValue({ reachable: false, ok: false });
    const res = await startPOST(fakeReq, params('1'));
    expect(mockRun).toHaveBeenCalledWith(
      expect.stringContaining('SET disabled = 0 WHERE id = ?'), ['1']
    );
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'start', degraded: true });
  });

  it('500 when the DB lookup throws', async () => {
    mockGet.mockRejectedValue(new Error('db locked'));
    const res = await startPOST(fakeReq, params('1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to start stream' });
  });
});

describe('POST /api/supervisor/streams/[id]/restart', () => {
  beforeEach(() => { mockGet.mockReset(); mockRun.mockReset(); mockRequestRestart.mockReset(); });

  it('404 when the stream id is unknown', async () => {
    mockGet.mockResolvedValue(undefined);
    const res = await restartPOST(fakeReq, params('999'));
    expect(res.status).toBe(404);
    expect(mockRequestRestart).not.toHaveBeenCalled();
  });

  it('200 with restarted=true when the supervisor restarts the stream', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestRestart.mockResolvedValue(true);
    const res = await restartPOST(fakeReq, params('1'));
    expect(mockRequestRestart).toHaveBeenCalledWith('team_a');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'restart', restarted: true });
  });

  // Current contract: restarted=false covers BOTH "not supervised" and
  // "supervisor unreachable" (non-fatal client). PR-3a splits these into a
  // {kind} union — these tests pin today's behavior until then.
  it('200 with restarted=false when not supervised or supervisor unreachable', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestRestart.mockResolvedValue(false);
    const res = await restartPOST(fakeReq, params('1'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: '1', action: 'restart', restarted: false });
  });

  it('never writes the DB (restart is in-place only)', async () => {
    mockGet.mockResolvedValue({ obs_source_name: 'team_a' });
    mockRequestRestart.mockResolvedValue(true);
    await restartPOST(fakeReq, params('1'));
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('500 when the DB lookup throws', async () => {
    mockGet.mockRejectedValue(new Error('db locked'));
    const res = await restartPOST(fakeReq, params('1'));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Failed to restart stream' });
  });
});
