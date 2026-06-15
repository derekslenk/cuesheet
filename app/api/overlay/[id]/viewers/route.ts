import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { TABLE_NAMES } from '@/lib/constants';
import { getViewerCount, twitchLoginFromUrl } from '@/lib/twitch';
import { recordViewerLookupFailure } from '@/lib/overlayMetrics';

// Live data — never cached.
export const dynamic = 'force-dynamic';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, status: number, extraHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

/**
 * GET /api/overlay/[id]/viewers — the live viewer count the overlay polls.
 *
 * Best-effort: returns { viewers: <n> } when the stream's Twitch channel is
 * live, or { viewers: null } when it's offline, has no Twitch URL, or Twitch
 * credentials/the API are unavailable. The label simply omits the count when
 * null — it is never required for the label to render. Returns 404 for an
 * unknown stream id (mirrors the main overlay route).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Reject a malformed id before touching the DB (mirrors the main overlay route).
  const streamId = Number(id);
  if (!Number.isInteger(streamId) || streamId <= 0) {
    return json({ ok: false, id }, 404, { 'Cache-Control': 'no-store' });
  }
  try {
    const db = await getDatabase();
    const row = (await db.get(
      `SELECT url FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [streamId]
    )) as { url?: string } | undefined;

    if (!row) return json({ ok: false, id }, 404);

    const login = twitchLoginFromUrl(row.url);
    if (!login) return json({ viewers: null }, 200, { 'Cache-Control': 'no-store' });

    let viewers: number | null = null;
    try {
      viewers = await getViewerCount(login);
    } catch (error) {
      // Surface the misconfig/API error in logs + the health counter, but
      // degrade to null so the label keeps rendering without a count.
      console.error(`Viewer count failed for "${login}":`, error);
      recordViewerLookupFailure();
    }
    return json({ viewers }, 200, { 'Cache-Control': 'no-store' });
  } catch (error) {
    console.error('Error fetching viewer count:', error);
    return json({ viewers: null }, 200, { 'Cache-Control': 'no-store' });
  }
}
