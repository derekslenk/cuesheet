import { NextResponse } from 'next/server';
import { fetchSupervisorHealth } from '../../../../lib/supervisorClient';

// GET /api/supervisor/health
// Proxy for the streamlink supervisor's /health snapshot, used by the streams
// page to poll per-stream status. Degrades gracefully: when the supervisor is
// unreachable it returns reachable=false with an empty stream list rather than
// erroring, so the UI can fall back to the DB `disabled` flag.
export async function GET() {
  const health = await fetchSupervisorHealth();
  if (!health) {
    return NextResponse.json({ reachable: false, status: 'unknown', streams: [] });
  }
  return NextResponse.json({ reachable: true, ...health });
}
