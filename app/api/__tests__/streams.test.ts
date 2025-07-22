import { GET } from '../streams/route';

// Mock the database module
jest.mock('@/lib/database', () => ({
  getDatabase: jest.fn(),
}));

describe('/api/streams', () => {
  let mockDb: { all: jest.Mock };
  
  beforeEach(() => {
    // Create mock database
    mockDb = {
      all: jest.fn(),
    };
    
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
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM')
      );
      
      const { NextResponse } = require('next/server');
      expect(NextResponse.json).toHaveBeenCalledWith(mockStreams);
    });

    it('returns empty array when no streams exist', async () => {
      mockDb.all.mockResolvedValue([]);
      
      const { NextResponse } = require('next/server');
      expect(NextResponse.json).toHaveBeenCalledWith([]);
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockDb.all.mockRejectedValue(dbError);
      
      const { NextResponse } = require('next/server');
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch streams' },
        { status: 500 }
      );
    });

    it('handles database connection errors', async () => {
      const connectionError = new Error('Failed to connect to database');
      const { getDatabase } = require('@/lib/database');
      getDatabase.mockRejectedValue(connectionError);
      
      const { NextResponse } = require('next/server');
      expect(NextResponse.json).toHaveBeenCalledWith(
        { error: 'Failed to fetch streams' },
        { status: 500 }
      );
    });
  });
});