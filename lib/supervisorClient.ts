/**
 * Best-effort client for the Streamlink supervisor's control endpoints.
 *
 * The supervisor reads the stream list from the DB at startup; after the webui
 * adds or removes a stream it pings /reload so the supervisor reconciles
 * (starts feeding new streams, stops removed ones) WITHOUT a restart. This is
 * intentionally non-fatal: if the supervisor isn't running (e.g. local dev, or
 * before it's started on the host), the add/remove still succeeds.
 */

const SUPERVISOR_URL = process.env.SUPERVISOR_URL || 'http://127.0.0.1:8080';
const RELOAD_TIMEOUT_MS = 3000;

export async function requestSupervisorReload(): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELOAD_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPERVISOR_URL}/reload`, {
      method: 'POST',
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn(`[supervisorClient] /reload returned ${res.status}`);
      return;
    }
    const body = await res.json().catch(() => ({}));
    console.log('[supervisorClient] supervisor reloaded:', body);
  } catch (err) {
    // Non-fatal: supervisor may be down. The DB/OBS change already succeeded.
    console.warn(
      `[supervisorClient] reload skipped — ${err instanceof Error ? err.message : String(err)}`
    );
  } finally {
    clearTimeout(timer);
  }
}
