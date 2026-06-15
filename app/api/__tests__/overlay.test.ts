/**
 * @jest-environment node
 *
 * Tests for GET /api/overlay/[id] — the data feed for the HTML stream label.
 * getDatabase is mocked so no real SQLite is touched.
 */
import { GET } from '../overlay/[id]/route';
import { overlayMetricsSnapshot, __resetOverlayMetrics } from '@/lib/overlayMetrics';

jest.mock('@/lib/database', () => ({ getDatabase: jest.fn() }));

function call(id: string) {
  return GET({} as never, { params: Promise.resolve({ id }) } as never);
}

describe('GET /api/overlay/[id]', () => {
  let mockDb: { get: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { get: jest.fn() };
    require('@/lib/database').getDatabase.mockResolvedValue(mockDb);
  });

  it('returns the overlay contract (no-store) for a valid id', async () => {
    mockDb.get.mockResolvedValue({
      id: 7,
      name: 'Palpatine',
      team_name: 'Jellyfish',
      group_name: null,
    });

    const res = await call('7');

    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      streamId: 7,
      streamerName: 'Palpatine',
      teamName: 'Jellyfish',
      colors: { bg: '#472f5a', accent: '#e0d9f1', text: '#ffffff' },
      logoUrl: null,
      role: null,
      live: { viewers: null },
      score: null,
    });
  });

  it('404s an unknown id with { ok:false, id } (visible-degrade path)', async () => {
    mockDb.get.mockResolvedValue(undefined);

    const res = await call('999');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, id: '999' });
  });

  it('applies per-team branding columns when present', async () => {
    mockDb.get.mockResolvedValue({
      id: 1,
      name: 'Ana',
      team_name: 'Reds',
      color_bg: '#aa0000',
      color_accent: '#ffcc00',
      color_text: '#000000',
      logo_path: '/logos/reds.png',
      role: 'Tank',
    });

    const body = await (await call('1')).json();
    expect(body.colors).toEqual({ bg: '#aa0000', accent: '#ffcc00', text: '#000000' });
    expect(body.logoUrl).toBe('/logos/reds.png');
    expect(body.role).toBe('Tank'); // role (from streams.role via s.*) flows to the contract
  });

  it('404s a malformed (non-numeric) id without touching the DB or the stale-id counter', async () => {
    __resetOverlayMetrics();

    const res = await call('abc');

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, id: 'abc' });
    expect(mockDb.get).not.toHaveBeenCalled();
    expect(overlayMetricsSnapshot().overlayUnknownId).toBe(0);
  });

  it('500s with { ok:false } when the DB query throws', async () => {
    mockDb.get.mockRejectedValue(new Error('boom'));

    const res = await call('5');

    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});
