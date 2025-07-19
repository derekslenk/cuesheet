import { NextResponse } from 'next/server';

// Standard error response structure
export interface APIError {
  error: string;
  message?: string;
  details?: unknown;
  timestamp: string;
}

// Standard success response structure  
export interface APISuccess<T = unknown> {
  success: true;
  data: T;
  timestamp: string;
}

// Create standardized error response
export function createErrorResponse(
  error: string,
  status: number = 500,
  message?: string,
  details?: unknown
): NextResponse {
  const errorResponse: APIError = {
    error,
    message,
    details,
    timestamp: new Date().toISOString(),
  };

  console.error(`API Error [${status}]:`, errorResponse);
  
  return NextResponse.json(errorResponse, { status });
}

// Create standardized success response
export function createSuccessResponse<T>(
  data: T,
  status: number = 200
): NextResponse {
  const successResponse: APISuccess<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json(successResponse, { status });
}

// Validation error response
export function createValidationError(
  message: string,
  details?: Record<string, string>
): NextResponse {
  return createErrorResponse(
    'Validation Error',
    400,
    message,
    details
  );
}

// Database error response
export function createDatabaseError(
  operation: string,
  originalError?: unknown
): NextResponse {
  const message = `Database operation failed: ${operation}`;
  return createErrorResponse(
    'Database Error',
    500,
    message,
    process.env.NODE_ENV === 'development' ? originalError : undefined
  );
}

// OBS connection error response
export function createOBSError(
  operation: string,
  originalError?: unknown
): NextResponse {
  const message = `OBS operation failed: ${operation}`;
  return createErrorResponse(
    'OBS Error',
    502,
    message,
    process.env.NODE_ENV === 'development' ? originalError : undefined
  );
}

// Wrap async API handlers with error handling
export function withErrorHandling<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error('Unhandled API error:', error);
      
      if (error instanceof Error) {
        return createErrorResponse(
          'Internal Server Error',
          500,
          'An unexpected error occurred',
          process.env.NODE_ENV === 'development' ? error.stack : undefined
        );
      }
      
      return createErrorResponse(
        'Internal Server Error',
        500,
        'An unknown error occurred'
      );
    }
  };
}

// Request body validation helper
export async function parseRequestBody<T>(
  request: Request,
  validator?: (data: unknown) => { valid: boolean; data?: T; errors?: Record<string, string> }
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const body = await request.json();
    
    if (validator) {
      const validation = validator(body);
      if (!validation.valid) {
        return {
          success: false,
          response: createValidationError(
            'Request validation failed',
            validation.errors
          ),
        };
      }
      return { success: true, data: validation.data! };
    }
    
    return { success: true, data: body as T };
  } catch (error) {
    return {
      success: false,
      response: createErrorResponse(
        'Invalid Request',
        400,
        'Request body must be valid JSON'
      ),
    };
  }
}