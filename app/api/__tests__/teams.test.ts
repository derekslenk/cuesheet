import { GET } from '../teams/route';

// Mock the database module
jest.mock('@/lib/database', () => ({
  getDatabase: jest.fn(),
}));

// Mock the apiHelpers module
jest.mock('@/lib/apiHelpers', () => ({
  withErrorHandling: jest.fn((handler) => handler),
  createSuccessResponse: jest.fn((data, status = 200) => ({
    data,
    status,
    json: async () => ({ success: true, data }),
  })),
  createDatabaseError: jest.fn((operation, error) => ({
    error: 'Database Error',
    status: 500,
    json: async () => ({ 
      error: 'Database Error',
      message: `Database operation failed: ${operation}`,
    }),
  })),
}));

describe('/api/teams', () => {
  let mockDb: any;
  
  beforeEach(() => {
    // Create mock database
    mockDb = {
      all: jest.fn(),
    };
    
    const { getDatabase } = require('@/lib/database');
    getDatabase.mockResolvedValue(mockDb);
  });

  describe('GET /api/teams', () => {
    it('returns all teams successfully', async () => {
      const mockTeams = [
        { team_id: 1, team_name: 'Team Alpha' },
        { team_id: 2, team_name: 'Team Beta' },
        { team_id: 3, team_name: 'Team Gamma' },
      ];
      
      mockDb.all.mockResolvedValue(mockTeams);
      
      const response = await GET();
      
      expect(mockDb.all).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM')
      );
      
      const { createSuccessResponse } = require('@/lib/apiHelpers');
      expect(createSuccessResponse).toHaveBeenCalledWith(mockTeams);
    });

    it('returns empty array when no teams exist', async () => {
      mockDb.all.mockResolvedValue([]);
      
      const response = await GET();
      
      const { createSuccessResponse } = require('@/lib/apiHelpers');
      expect(createSuccessResponse).toHaveBeenCalledWith([]);
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Table does not exist');
      mockDb.all.mockRejectedValue(dbError);
      
      const response = await GET();
      
      const { createDatabaseError } = require('@/lib/apiHelpers');
      expect(createDatabaseError).toHaveBeenCalledWith('fetch teams', dbError);
    });

    it('handles database connection errors', async () => {
      const connectionError = new Error('Failed to connect to database');
      const { getDatabase } = require('@/lib/database');
      getDatabase.mockRejectedValue(connectionError);
      
      const response = await GET();
      
      const { createDatabaseError } = require('@/lib/apiHelpers');
      expect(createDatabaseError).toHaveBeenCalledWith('fetch teams', connectionError);
    });
  });
});