import { NextResponse } from 'next/server';
import { isDev } from './isDev';

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

/**
 * Canonical API response envelope for cuesheet's control-plane routes:
 *   success → { success: true, data, timestamp }          (createSuccessResponse)
 *   error   → { error, message?, details?, timestamp }    (createErrorResponse)
 *
 * `details` is gated to development by default (see createErrorResponse) so
 * internal error objects / stack traces never leak to clients in production.
 *
 * Deliberate, documented exceptions that do NOT use this envelope:
 *   - app/api/overlay/*        → their own { ok } contract (dedicated OBS
 *                                browser-source consumer)
 *   - app/api/supervisor/*     → a break-glass { reachable | degraded } shape
 *   - app/api/preview/[...slug] → a binary HLS body
 */
export type APIEnvelope<T = unknown> = APISuccess<T> | APIError;

// Create standardized error response.
//
// `details` is gated to development by default so internal error objects, stack
// traces, or raw error strings never leak to clients in production — callers can
// pass raw details freely and trust this function not to expose them. Pass
// { detailsAlways: true } for details that are part of the client contract and
// safe in any environment (e.g. field-level validation errors). The full
// (ungated) details are always logged server-side. See docs/full-review-2026-06
// (S-F5).
export function createErrorResponse(
  error: string,
  status: number = 500,
  message?: string,
  details?: unknown,
  options?: { detailsAlways?: boolean }
): NextResponse {
  const timestamp = new Date().toISOString();

  // Log the full details server-side regardless of environment.
  console.error(`API Error [${status}]:`, { error, message, details, timestamp });

  const includeDetails = details !== undefined && (options?.detailsAlways === true || isDev());
  const errorResponse: APIError = {
    error,
    message,
    details: includeDetails ? details : undefined,
    timestamp,
  };

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
  // Validation details are field-level messages meant for the client, so they
  // are part of the contract and returned in every environment.
  return createErrorResponse(
    'Validation Error',
    400,
    message,
    details,
    { detailsAlways: true }
  );
}

// Database error response
export function createDatabaseError(
  operation: string,
  originalError?: unknown
): NextResponse {
  const message = `Database operation failed: ${operation}`;
  // createErrorResponse gates `details` to development; pass the raw error.
  return createErrorResponse(
    'Database Error',
    500,
    message,
    originalError
  );
}

// OBS connection error response
export function createOBSError(
  operation: string,
  originalError?: unknown
): NextResponse {
  const message = `OBS operation failed: ${operation}`;
  // createErrorResponse gates `details` to development; pass the raw error.
  return createErrorResponse(
    'OBS Error',
    502,
    message,
    originalError
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
          error.stack
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
  } catch {
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