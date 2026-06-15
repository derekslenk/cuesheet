import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { TABLE_NAMES } from '@/lib/constants';
import { buildOverlayData, type OverlayStreamRow } from '@/lib/overlayData';
import { recordOverlayRequest, recordOverlayUnknownId } from '@/lib/overlayMetrics';

// Always live: the label must reflect the current DB row, never a cached one.
export const dynamic = 'force-dynamic';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * GET /api/overlay/[id] — data feed for the HTML stream-label overlay.
 *
 * Returns the OverlayData contract for a valid stream id. For an unknown id it
 * returns HTTP 404 { ok:false, id } so the overlay page can render a VISIBLE
 * "NO DATA" placeholder instead of a silent transparent gap — important because
 * the OBS browser-source URL is baked at scene creation and a re-import
 * (delete+re-add) churns the PK (plan §4.2 / pre-mortem #1).
 *
 * This route returns the contract directly (not the apiHelpers success
 * envelope) because the overlay is its own dedicated consumer.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Reject a malformed id (e.g. /api/overlay/abc) before touching the DB. This
  // is NOT a stale baked URL pointing at a deleted stream, so it must not bump
  // the unknown-id counter — just 404.
  const streamId = Number(id);
  if (!Number.isInteger(streamId) || streamId <= 0) {
    return json({ ok: false, id }, 404);
  }
  try {
    const db = await getDatabase();
    // s.* (id/name/role + ...) then t.* (team_name + branding) so every label
    // field flows through, and the query still works on a DB that predates the
    // role/branding columns (they're simply absent from the row). team_id
    // collides between the two and resolves to t.team_id — unused by the overlay.
    const row = (await db.get(
      `SELECT s.*, t.*
       FROM ${TABLE_NAMES.STREAMS} s
       LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id
       WHERE s.id = ?`,
      [streamId]
    )) as OverlayStreamRow | undefined;

    if (!row) {
      // A stale/dead baked overlay URL (e.g. re-import churned the PK). Log +
      // count it so the operator can see silent blank labels on the health panel.
      console.warn(`[overlay] unknown stream id ${id} (stale overlay URL?)`);
      recordOverlayUnknownId(id);
      return json({ ok: false, id }, 404);
    }

    recordOverlayRequest();
    return json(buildOverlayData(row), 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('Error building overlay data:', error);
    return json({ ok: false, id, error: 'overlay_data_failed' }, 500);
  }
}
