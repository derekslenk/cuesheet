/**
 * @jest-environment node
 */
import { requestSupervisorStart, requestSupervisorStop } from '../supervisorClient';

describe('requestSupervisorStart/Stop', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns { reachable: true, ok: true } on a 200 from the supervisor', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
    const result = await requestSupervisorStop('team_a');
    expect(result).toEqual({ reachable: true, ok: true });
    expect(global.fetch).toHaveBeenCalledWith(
      'http://127.0.0.1:8080/streams/team_a/stop',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('returns { reachable: true, ok: false } on a 404', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));
    const result = await requestSupervisorStart('ghost');
    expect(result).toEqual({ reachable: true, ok: false });
  });

  it('returns { reachable: false, ok: false } when fetch throws (supervisor down)', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await requestSupervisorStart('team_a');
    expect(result).toEqual({ reachable: false, ok: false });
  });
});
