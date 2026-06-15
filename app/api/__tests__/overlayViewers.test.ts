/**
 * @jest-environment node
 *
 * Tests for GET /api/overlay/[id]/viewers. getDatabase + the Twitch viewer
 * lookup are mocked; the real twitchLoginFromUrl is used.
 */
import { GET } from '../overlay/[id]/viewers/route';

jest.mock('@/lib/database', () => ({ getDatabase: jest.fn() }));
jest.mock('@/lib/twitch', () => ({
  getViewerCount: jest.fn(),
  twitchLoginFromUrl: jest.requireActual('@/lib/twitch').twitchLoginFromUrl,
}));

function call(id: string) {
  return GET({} as never, { params: Promise.resolve({ id }) } as never);
}

describe('GET /api/overlay/[id]/viewers', () => {
  let mockDb: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { get: jest.fn() };
    require('@/lib/database').getDatabase.mockResolvedValue(mockDb);
  });

  it('returns the live viewer count for a twitch stream', async () => {
    mockDb.get.mockResolvedValue({ url: 'https://www.twitch.tv/Nova' });
    require('@/lib/twitch').getViewerCount.mockResolvedValue(1234);

    const res = await call('1');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewers: 1234 });
    expect(require('@/lib/twitch').getViewerCount).toHaveBeenCalledWith('nova');
  });

  it('404s an unknown stream id', async () => {
    mockDb.get.mockResolvedValue(undefined);
    const res = await call('999');
    expect(res.status).toBe(404);
  });

  it('returns viewers:null for a non-twitch url (no Twitch call)', async () => {
    mockDb.get.mockResolvedValue({ url: 'https://youtube.com/x' });

    const res = await call('2');

    expect(await res.json()).toEqual({ viewers: null });
    expect(require('@/lib/twitch').getViewerCount).not.toHaveBeenCalled();
  });

  it('degrades to viewers:null when the Twitch lookup throws', async () => {
    mockDb.get.mockResolvedValue({ url: 'https://www.twitch.tv/Nova' });
    require('@/lib/twitch').getViewerCount.mockRejectedValue(new Error('boom'));

    const res = await call('3');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewers: null });
  });

  it('degrades to viewers:null with no-store when the DB lookup itself throws', async () => {
    require('@/lib/database').getDatabase.mockRejectedValue(new Error('db down'));

    const res = await call('4');

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ viewers: null });
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('404s a malformed id with no-store and never queries the DB', async () => {
    const res = await call('abc');

    expect(res.status).toBe(404);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(mockDb.get).not.toHaveBeenCalled();
  });
});
