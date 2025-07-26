import { NextRequest, NextResponse } from 'next/server';

export function middleware(request: NextRequest) {
  // Only protect API routes
  if (request.nextUrl.pathname.startsWith('/api/')) {
    // Allow OPTIONS requests for CORS preflight
    if (request.method === 'OPTIONS') {
      return NextResponse.next();
    }

    // Check for API key in header or URL parameter
    const apiKey = request.headers.get('x-api-key') || request.nextUrl.searchParams.get('apikey');
    const validKey = process.env.API_KEY;

    // If API_KEY is not set in environment, skip authentication (development mode)
    if (!validKey) {
      console.warn('API_KEY not set in environment variables. API endpoints are unprotected!');
      return NextResponse.next();
    }

    // Skip authentication for localhost/internal requests (optional security)
    const host = request.headers.get('host');
    if (host && (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('192.168.'))) {
      return NextResponse.next();
    }

    // Validate API key for external requests
    if (!apiKey || apiKey !== validKey) {
      return NextResponse.json(
        { error: 'Unauthorized. Valid API key required.' },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/api/:path*'
};