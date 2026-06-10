/**
 * @jest-environment node
 */
import { POST as stopPOST } from '../stop/route';

const mockGet = jest.fn();
const mockRun = jest.fn();
jest.mock('../../../../../../lib/database', () => ({
  getDatabase: async () => ({ get: mockGet, run: mockRun }),
}));

const mockRequestStop = jest.fn();
jest.mock('../../../../../../lib/supervisorClient', () => ({
  requestSupervisorStop: (...a: unknown[]) => mockRequestStop(...a),
  requestSupervisorStart: jest.fn(),
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
