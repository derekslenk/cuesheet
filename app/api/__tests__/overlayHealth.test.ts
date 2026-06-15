/**
 * @jest-environment node
 *
 * Tests for GET /api/overlay/health. getDatabase is mocked; the label/twitch
 * helpers it imports are pure and read from env.
 */
import { GET } from '../overlay/health/route';

jest.mock('@/lib/database', () => ({ getDatabase: jest.fn() }));

const { __resetOverlayMetrics, recordOverlayUnknownId } = require('@/lib/overlayMetrics');

const SAVED = {
  renderer: process.env.LABEL_RENDERER,
  shutdown: process.env.LABEL_SHUTDOWN_WHEN_HIDDEN,
  base: process.env.LABEL_OVERLAY_BASE_URL,
  id: process.env.TWITCH_CLIENT_ID,
  secret: process.env.TWITCH_CLIENT_SECRET,
};

let mockDb: { get: jest.Mock };

beforeEach(() => {
  jest.clearAllMocks();
  __resetOverlayMetrics();
  delete process.env.LABEL_RENDERER;
  delete process.env.LABEL_SHUTDOWN_WHEN_HIDDEN;
  delete process.env.LABEL_OVERLAY_BASE_URL;
  delete process.env.TWITCH_CLIENT_ID;
  delete process.env.TWITCH_CLIENT_SECRET;
  mockDb = { get: jest.fn() };
  require('@/lib/database').getDatabase.mockResolvedValue(mockDb);
});

afterAll(() => {
  for (const [k, v] of Object.entries({
    LABEL_RENDERER: SAVED.renderer,
    LABEL_SHUTDOWN_WHEN_HIDDEN: SAVED.shutdown,
    LABEL_OVERLAY_BASE_URL: SAVED.base,
    TWITCH_CLIENT_ID: SAVED.id,
    TWITCH_CLIENT_SECRET: SAVED.secret,
  })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('GET /api/overlay/health', () => {
  it('reports renderer config, twitch status, counts, and metrics', async () => {
    mockDb.get.mockResolvedValueOnce({ n: 6 }).mockResolvedValueOnce({ n: 3 });
    recordOverlayUnknownId('42', 1000);

    const res = await GET({} as never);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.renderer).toBe('html'); // default
    expect(body.shutdownWhenHidden).toBe(true); // default
    expect(body.twitchConfigured).toBe(false);
    expect(body.overlayBaseUrl).toBe('http://localhost:3000');
    expect(body.streamCount).toBe(6);
    expect(body.teamsWithBranding).toBe(3);
    expect(body.metrics.overlayUnknownId).toBe(1);
    expect(body.metrics.lastUnknownId).toBe('42');
  });

  it('reports twitchConfigured true when creds are present', async () => {
    process.env.TWITCH_CLIENT_ID = 'cid';
    process.env.TWITCH_CLIENT_SECRET = 'csec';
    mockDb.get.mockResolvedValue({ n: 0 });

    const body = await (await GET({} as never)).json();
    expect(body.twitchConfigured).toBe(true);
  });

  it('degrades counts to null on a DB error (still ok)', async () => {
    mockDb.get.mockRejectedValue(new Error('boom'));

    const body = await (await GET({} as never)).json();
    expect(body.ok).toBe(true);
    expect(body.streamCount).toBeNull();
    expect(body.teamsWithBranding).toBeNull();
  });
});
