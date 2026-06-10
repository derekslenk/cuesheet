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
const HEALTH_TIMEOUT_MS = 3000;

export interface SupervisorStreamSnapshot {
  streamId: string;
  status: string;
  restartCount: number;
  obsInputUrl: string;
}

export interface SupervisorHealth {
  status: string;
  streams: SupervisorStreamSnapshot[];
}

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

/**
 * Restart a single supervised stream in place (POST /streams/{streamId}/restart).
 * `streamId` is the supervisor's stream id — i.e. the stream's obs_source_name.
 * Returns true on success, false if the supervisor reports the stream isn't
 * supervised (404) or is unreachable. Non-throwing, like the reload helper.
 */
export async function requestSupervisorRestart(streamId: string): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELOAD_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${SUPERVISOR_URL}/streams/${encodeURIComponent(streamId)}/restart`,
      { method: 'POST', signal: controller.signal }
    );
    if (!res.ok) {
      console.warn(`[supervisorClient] restart ${streamId} returned ${res.status}`);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(
      `[supervisorClient] restart skipped — ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export interface SupervisorControlResult {
  // false => could not reach the supervisor at all (use the break-glass path).
  reachable: boolean;
  // true => the supervisor returned a 2xx for the action.
  ok: boolean;
}

async function postControl(streamId: string, action: 'start' | 'stop'): Promise<SupervisorControlResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RELOAD_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${SUPERVISOR_URL}/streams/${encodeURIComponent(streamId)}/${action}`,
      { method: 'POST', signal: controller.signal }
    );
    if (!res.ok) {
      console.warn(`[supervisorClient] ${action} ${streamId} returned ${res.status}`);
    }
    return { reachable: true, ok: res.ok };
  } catch (err) {
    console.warn(
      `[supervisorClient] ${action} unreachable — ${err instanceof Error ? err.message : String(err)}`
    );
    return { reachable: false, ok: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Durably start a single stream via the supervisor (POST /streams/{id}/start). */
export async function requestSupervisorStart(streamId: string): Promise<SupervisorControlResult> {
  return postControl(streamId, 'start');
}

/** Durably stop a single stream via the supervisor (POST /streams/{id}/stop). */
export async function requestSupervisorStop(streamId: string): Promise<SupervisorControlResult> {
  return postControl(streamId, 'stop');
}

/**
 * Fetch the supervisor health snapshot (GET /health). Returns null when the
 * supervisor is unreachable so callers can degrade gracefully (e.g. local dev,
 * or before the supervisor is started on the host).
 */
export async function fetchSupervisorHealth(): Promise<SupervisorHealth | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${SUPERVISOR_URL}/health`, { signal: controller.signal });
    if (!res.ok) {
      console.warn(`[supervisorClient] /health returned ${res.status}`);
      return null;
    }
    const body = (await res.json()) as SupervisorHealth;
    return body;
  } catch (err) {
    console.warn(
      `[supervisorClient] health skipped — ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
