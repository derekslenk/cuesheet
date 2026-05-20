import { GET } from '../streams/route';

jest.mock('@/lib/database', () => ({
  getDatabase: jest.fn(),
}));

jest.mock('@/lib/apiHelpers', () => ({
  withErrorHandling: jest.fn((handler) => handler),
  createSuccessResponse: jest.fn((data, status = 200) => ({
    data,
    status,
    json: async () => ({ success: true, data }),
  })),
  createDatabaseError: jest.fn((operation) => ({
    error: 'Database Error',
    status: 500,
    json: async () => ({
      error: 'Database Error',
      message: `Database operation failed: ${operation}`,
    }),
  })),
}));

describe('/api/streams', () => {
  let mockDb: { all: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = { all: jest.fn() };

    const { getDatabase } = require('@/lib/database');
    getDatabase.mockResolvedValue(mockDb);
  });

  describe('GET /api/streams', () => {
    it('returns all streams successfully', async () => {
      const mockStreams = [
        { id: 1, name: 'Stream 1', url: 'http://example.com/1', obs_source_name: 'Source 1', team_id: 1 },
        { id: 2, name: 'Stream 2', url: 'http://example.com/2', obs_source_name: 'Source 2', team_id: 2 },
      ];
      mockDb.all.mockResolvedValue(mockStreams);

      await GET();

      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT')
      );

      const { createSuccessResponse } = require('@/lib/apiHelpers');
      expect(createSuccessResponse).toHaveBeenCalledWith(mockStreams);
    });

    it('returns empty array when no streams exist', async () => {
      mockDb.all.mockResolvedValue([]);

      await GET();

      const { createSuccessResponse } = require('@/lib/apiHelpers');
      expect(createSuccessResponse).toHaveBeenCalledWith([]);
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.all.mockRejectedValue(dbError);

      await GET();

      const { createDatabaseError } = require('@/lib/apiHelpers');
      expect(createDatabaseError).toHaveBeenCalledWith('fetch streams', dbError);
    });

    it('handles database connection errors', async () => {
      const connectionError = new Error('Failed to connect to database');
      const { getDatabase } = require('@/lib/database');
      getDatabase.mockRejectedValue(connectionError);

      await GET();

      const { createDatabaseError } = require('@/lib/apiHelpers');
      expect(createDatabaseError).toHaveBeenCalledWith('fetch streams', connectionError);
    });
  });
});
