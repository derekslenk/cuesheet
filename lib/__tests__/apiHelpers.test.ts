import { NextResponse } from 'next/server';
import {
  createErrorResponse,
  createSuccessResponse,
  createValidationError,
  createDatabaseError,
  createOBSError,
  parseRequestBody,
} from '../apiHelpers';

// Mock NextResponse
jest.mock('next/server', () => ({
  NextResponse: {
    json: jest.fn((data, options) => ({
      data,
      status: options?.status || 200,
    })),
  },
}));

// isDev() is mocked so the dev/prod detail branches are controllable regardless
// of how next/jest inlines process.env.NODE_ENV. Default (undefined) = production.
jest.mock('../isDev', () => ({ isDev: jest.fn() }));
import { isDev } from '../isDev';
const mockIsDev = isDev as jest.Mock;

// Mock console.error to silence expected error logs
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

describe('apiHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(() => {
    mockConsoleError.mockRestore();
  });

  describe('createErrorResponse', () => {
    it('creates error response with default status 500', () => {
      createErrorResponse('Test Error');
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test Error',
          timestamp: expect.any(String),
        }),
        { status: 500 }
      );
    });

    it('creates error response with custom status and message', () => {
      createErrorResponse('Test Error', 400, 'Custom message', { detail: 'extra' });
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Test Error',
          message: 'Custom message',
          details: { detail: 'extra' },
          timestamp: expect.any(String),
        }),
        { status: 400 }
      );
    });

    it('logs error to console', () => {
      // Temporarily restore the mock to capture calls
      mockConsoleError.mockRestore();
      const tempMock = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      createErrorResponse('Test Error', 400);
      
      expect(tempMock).toHaveBeenCalledWith(
        'API Error [400]:',
        expect.objectContaining({
          error: 'Test Error',
          timestamp: expect.any(String),
        })
      );
      
      // Restore the original mock
      tempMock.mockRestore();
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });
  });

  describe('createSuccessResponse', () => {
    it('creates success response with default status 200', () => {
      const data = { test: 'data' };
      createSuccessResponse(data);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { test: 'data' },
          timestamp: expect.any(String),
        }),
        { status: 200 }
      );
    });

    it('creates success response with custom status', () => {
      const data = { id: 1, name: 'test' };
      createSuccessResponse(data, 201);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: { id: 1, name: 'test' },
          timestamp: expect.any(String),
        }),
        { status: 201 }
      );
    });
  });

  describe('specialized error responses', () => {
    it('createValidationError creates 400 response', () => {
      const details = { field: 'error message' };
      createValidationError('Validation failed', details);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Validation Error',
          message: 'Validation failed',
          details,
        }),
        { status: 400 }
      );
    });

    it('createDatabaseError creates 500 response', () => {
      const originalError = new Error('DB connection failed');
      createDatabaseError('fetch users', originalError);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Database Error',
          message: 'Database operation failed: fetch users',
        }),
        { status: 500 }
      );
    });

    it('createOBSError creates 502 response', () => {
      const originalError = new Error('WebSocket failed');
      createOBSError('connect to OBS', originalError);
      
      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'OBS Error',
          message: 'OBS operation failed: connect to OBS',
        }),
        { status: 502 }
      );
    });
  });

  describe('parseRequestBody', () => {
    const mockRequest = (body: unknown): Request => ({
      json: jest.fn().mockResolvedValue(body),
    } as unknown as Request);

    it('parses valid JSON body without validator', async () => {
      const body = { name: 'test', value: 123 };
      const request = mockRequest(body);
      
      const result = await parseRequestBody(request);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(body);
      }
    });

    it('handles invalid JSON', async () => {
      const request = {
        json: jest.fn().mockRejectedValue(new Error('Invalid JSON')),
      } as unknown as Request;
      
      const result = await parseRequestBody(request);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.response).toBeDefined();
      }
    });

    it('validates body with custom validator', async () => {
      const body = { name: 'test' };
      const request = mockRequest(body);
      
      const validator = jest.fn().mockReturnValue({
        valid: true,
        data: { name: 'test' },
      });
      
      const result = await parseRequestBody(request, validator);
      
      expect(result.success).toBe(true);
      expect(validator).toHaveBeenCalledWith(body);
      if (result.success) {
        expect(result.data).toEqual({ name: 'test' });
      }
    });

    it('handles validation failure', async () => {
      const body = { name: '' };
      const request = mockRequest(body);
      
      const validator = jest.fn().mockReturnValue({
        valid: false,
        errors: { name: 'Name is required' },
      });
      
      const result = await parseRequestBody(request, validator);
      
      expect(result.success).toBe(false);
      expect(validator).toHaveBeenCalledWith(body);
    });
  });

  describe('environment-specific behavior', () => {
    it('includes error details in development', () => {
      mockIsDev.mockReturnValue(true);
      const originalError = new Error('Test error');

      createDatabaseError('test operation', originalError);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: originalError,
        }),
        { status: 500 }
      );
    });

    it('excludes error details in production', () => {
      mockIsDev.mockReturnValue(false);
      const originalError = new Error('Test error');

      createDatabaseError('test operation', originalError);

      expect(NextResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          details: undefined,
        }),
        { status: 500 }
      );
    });
  });
});