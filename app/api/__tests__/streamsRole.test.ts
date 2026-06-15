/**
 * @jest-environment node
 *
 * Tests that PUT /api/streams/[id] persists the player role. getDatabase + the
 * OBS/preview deps (imported by the route for DELETE) are mocked.
 */
import { PUT } from '../streams/[id]/route';

jest.mock('@/lib/database', () => ({ getDatabase: jest.fn() }));
jest.mock('@/lib/obsClient', () => ({
  deleteStreamComponents: jest.fn(),
  clearTextFilesForStream: jest.fn(),
}));
jest.mock('@/lib/previewManager', () => ({ stopPreview: jest.fn() }));

function put(id: string, body: unknown) {
  return PUT({ json: async () => body } as never, { params: Promise.resolve({ id }) } as never);
}

describe('PUT /api/streams/[id] role', () => {
  let mockDb: { get: jest.Mock; run: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {
      get: jest.fn().mockResolvedValue({ id: 1 }),
      run: jest.fn().mockResolvedValue({ changes: 1 }),
    };
    require('@/lib/database').getDatabase.mockResolvedValue(mockDb);
  });

  it('persists role alongside the other fields', async () => {
    const res = await put('1', {
      name: 'A',
      obs_source_name: 'a',
      url: 'https://x',
      team_id: 2,
      role: 'Healer',
    });

    expect(res.status).toBe(200);
    const update = mockDb.run.mock.calls.find(([sql]) => String(sql).includes('UPDATE'));
    expect(update[0]).toContain('role = ?');
    expect(update[1]).toEqual(['A', 'a', 'https://x', 2, 'Healer', '1']);
  });

  it('normalizes a blank role to null', async () => {
    await put('1', {
      name: 'A',
      obs_source_name: 'a',
      url: 'https://x',
      team_id: 2,
      role: '   ',
    });

    const update = mockDb.run.mock.calls.find(([sql]) => String(sql).includes('UPDATE'));
    expect(update[1][4]).toBeNull();
  });
});
