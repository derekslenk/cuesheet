import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { TABLE_NAMES } from '../../../../../../lib/constants';
import { requestSupervisorRestart } from '../../../../../../lib/supervisorClient';

// POST /api/supervisor/streams/{id}/restart
// Restarts a running/escalated stream in place via the supervisor. No DB change
// (restart only applies to a supervised stream). The supervisor keys on
// obs_source_name, resolved here from the numeric id. Sibling start/stop routes
// own the durable `disabled` write (forwarded to the supervisor).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = await getDatabase();

    const stream = await db.get<{ obs_source_name: string }>(
      `SELECT obs_source_name FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [id]
    );
    if (!stream) {
      return NextResponse.json({ error: 'Stream not found' }, { status: 404 });
    }

    // restarted=false means the supervisor reported the stream isn't supervised
    // (it's stopped) or the supervisor is unreachable — surfaced to the UI as a
    // warning rather than a hard error, matching the non-fatal client contract.
    const restarted = await requestSupervisorRestart(stream.obs_source_name);

    return NextResponse.json({ success: true, id, action: 'restart', restarted });
  } catch (error) {
    console.error('Error restarting stream:', error);
    return NextResponse.json({ error: 'Failed to restart stream' }, { status: 500 });
  }
}
