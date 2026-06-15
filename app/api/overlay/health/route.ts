import { NextRequest } from 'next/server';
import { getDatabase } from '@/lib/database';
import { TABLE_NAMES } from '@/lib/constants';
import { labelRenderer, labelShutdownWhenHidden } from '@/lib/streamLabel';
import { hasTwitchCreds } from '@/lib/twitch';
import { overlayMetricsSnapshot } from '@/lib/overlayMetrics';

export const dynamic = 'force-dynamic';

/**
 * GET /api/overlay/health — operator-facing health of the HTML stream-label
 * system, shown on the Settings "Stream Label System" panel. Reports the label
 * renderer config, whether Twitch viewer counts are wired, label coverage, and
 * the in-memory failure counters (stale-id 404s, viewer lookup failures) so a
 * silent on-air failure surfaces off-air.
 */
export async function GET(_request: NextRequest) {
  const overlayBaseUrl = (process.env.LABEL_OVERLAY_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');

  let streamCount: number | null = null;
  let teamsWithBranding: number | null = null;
  try {
    const db = await getDatabase();
    streamCount = (await db.get(`SELECT COUNT(*) AS n FROM ${TABLE_NAMES.STREAMS}`))?.n ?? null;
    teamsWithBranding =
      (
        await db.get(
          `SELECT COUNT(*) AS n FROM ${TABLE_NAMES.TEAMS}
           WHERE color_bg IS NOT NULL OR color_accent IS NOT NULL
              OR color_text IS NOT NULL OR logo_path IS NOT NULL`
        )
      )?.n ?? null;
  } catch (error) {
    console.error('[overlay] health DB query failed:', error);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      renderer: labelRenderer(),
      shutdownWhenHidden: labelShutdownWhenHidden(),
      overlayBaseUrl,
      twitchConfigured: hasTwitchCreds(),
      streamCount,
      teamsWithBranding,
      metrics: overlayMetricsSnapshot(),
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } }
  );
}
