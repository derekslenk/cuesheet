/**
 * @jest-environment node
 */
import { GET } from '../route';

const mockFetchHealth = jest.fn();
jest.mock('../../../../../lib/supervisorClient', () => ({
  fetchSupervisorHealth: () => mockFetchHealth(),
}));

describe('GET /api/supervisor/health', () => {
  beforeEach(() => { mockFetchHealth.mockReset(); });

  it('degrades to reachable=false with empty streams when the supervisor is down', async () => {
    mockFetchHealth.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reachable: false, status: 'unknown', streams: [] });
  });

  it('proxies the snapshot with reachable=true when the supervisor responds', async () => {
    const health = {
      status: 'degraded',
      streams: [
        { streamId: 'team_a', status: 'running', restartCount: 0, obsInputUrl: 'udp://127.0.0.1:9001' },
        { streamId: 'team_b', status: 'backoff', restartCount: 3, obsInputUrl: 'udp://127.0.0.1:9002' },
      ],
    };
    mockFetchHealth.mockResolvedValue(health);
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ reachable: true, ...health });
  });
});
