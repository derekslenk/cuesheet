import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../../../lib/database';
import { TABLE_NAMES } from '../../../../../../lib/constants';
import { requestSupervisorStop } from '../../../../../../lib/supervisorClient';

// POST /api/supervisor/streams/{id}/stop
// Forwards to the supervisor, which owns the durable `disabled` write. If the
// supervisor is unreachable, break-glass: persist disabled=1 here so the next
// reconcile applies it (UI labels this "supervisor offline").
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

    const result = await requestSupervisorStop(stream.obs_source_name);

    if (result.reachable && result.ok) {
      return NextResponse.json({ success: true, id, action: 'stop' });
    }
    if (result.reachable && !result.ok) {
      return NextResponse.json(
        { error: 'Supervisor rejected the stop request' },
        { status: 502 }
      );
    }

    // Break-glass: supervisor unreachable — persist intent for the next reconcile.
    await db.run(`UPDATE ${TABLE_NAMES.STREAMS} SET disabled = 1 WHERE id = ?`, [id]);
    return NextResponse.json({ success: true, id, action: 'stop', degraded: true });
  } catch (error) {
    console.error('Error stopping stream:', error);
    return NextResponse.json({ error: 'Failed to stop stream' }, { status: 500 });
  }
}
