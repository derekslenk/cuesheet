/**
 * @jest-environment node
 *
 * Tests for the per-team branding fields on PUT /api/teams/[teamId]. getDatabase
 * + OBS/supervisor deps are mocked so no DB/OBS is touched.
 */
import { PUT } from '../teams/[teamId]/route';

jest.mock('@/lib/database', () => ({ getDatabase: jest.fn() }));
jest.mock('@/lib/obsClient', () => ({
  deleteTeamComponents: jest.fn(),
  deleteStreamComponents: jest.fn(),
  clearTextFilesForStream: jest.fn(),
}));
jest.mock('@/lib/supervisorClient', () => ({ requestSupervisorReload: jest.fn() }));

function put(teamId: string, body: unknown) {
  return PUT(
    { json: async () => body } as never,
    { params: Promise.resolve({ teamId }) } as never
  );
}

describe('PUT /api/teams/[teamId] branding', () => {
  let mockDb: { run: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { run: jest.fn().mockResolvedValue({ changes: 1 }) };
    require('@/lib/database').getDatabase.mockResolvedValue(mockDb);
  });

  it('updates all four branding columns when provided', async () => {
    const res = await put('3', {
      color_bg: '#112233',
      color_accent: '#445566',
      color_text: '#778899',
      logo_path: '/logos/x.png',
    });

    expect(res.status).toBe(200);
    const [sql, values] = mockDb.run.mock.calls[0];
    expect(sql).toContain('color_bg = ?');
    expect(sql).toContain('color_accent = ?');
    expect(sql).toContain('color_text = ?');
    expect(sql).toContain('logo_path = ?');
    expect(values).toEqual(['#112233', '#445566', '#778899', '/logos/x.png', 3]);
  });

  it('clears a branding field when null is passed (reset to default)', async () => {
    const res = await put('5', { color_bg: null });

    expect(res.status).toBe(200);
    const [sql, values] = mockDb.run.mock.calls[0];
    expect(sql).toContain('color_bg = ?');
    expect(values).toEqual([null, 5]);
  });

  it('400s when no updatable field is provided', async () => {
    const res = await put('5', {});

    expect(res.status).toBe(400);
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('still supports a name-only update (no regression)', async () => {
    const res = await put('2', { team_name: 'Renamed' });

    expect(res.status).toBe(200);
    const [sql, values] = mockDb.run.mock.calls[0];
    expect(sql).toContain('team_name = ?');
    expect(values).toEqual(['Renamed', 2]);
  });

  it('400s (no DB write) on an invalid color', async () => {
    const res = await put('3', { color_bg: 'red; background:url(http://evil)' });

    expect(res.status).toBe(400);
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('400s (no DB write) on an unsafe logo path', async () => {
    const res = await put('3', { logo_path: 'http://evil/x.png' });

    expect(res.status).toBe(400);
    expect(mockDb.run).not.toHaveBeenCalled();
  });

  it('allows null branding (reset) through validation', async () => {
    const res = await put('3', { color_bg: null, logo_path: null });

    expect(res.status).toBe(200);
    const [sql, values] = mockDb.run.mock.calls[0];
    expect(sql).toContain('color_bg = ?');
    expect(sql).toContain('logo_path = ?');
    expect(values).toEqual([null, null, 3]);
  });
});
