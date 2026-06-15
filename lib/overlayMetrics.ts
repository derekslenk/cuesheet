/**
 * In-memory operational counters for the HTML stream-label system, surfaced on
 * the Settings "Stream Label System" health panel so an operator can spot a
 * silent failure off-air (e.g. a stale baked overlay URL producing 404s, or
 * Twitch viewer lookups failing).
 *
 * This is a single-host broadcast tool, so process-local counters are enough;
 * they reset on server restart. Not a substitute for real metrics — just enough
 * visibility to catch the "blank label" failure modes the overlay can't show.
 */
export interface OverlayMetrics {
  /** Successful overlay-data responses served. */
  overlayRequests: number;
  /** 404s for an unknown stream id — a stale/dead baked overlay URL (e.g. after
   *  a re-import churned the PK). Climbing = a label is silently blank on air. */
  overlayUnknownId: number;
  /** Twitch viewer-count lookups that errored (creds/API problems). */
  viewerLookupFailures: number;
  /** Overlay-data responses that 500'd (DB/build error) — distinct from a stale
   *  404. Climbing = the overlay system itself is failing, not just stale URLs. */
  overlayRequestFailures: number;
  lastUnknownId: string | null;
  lastUnknownAt: number | null;
}

const metrics: OverlayMetrics = {
  overlayRequests: 0,
  overlayUnknownId: 0,
  viewerLookupFailures: 0,
  overlayRequestFailures: 0,
  lastUnknownId: null,
  lastUnknownAt: null,
};

export function recordOverlayRequest(): void {
  metrics.overlayRequests++;
}

export function recordOverlayRequestFailure(): void {
  metrics.overlayRequestFailures++;
}

export function recordOverlayUnknownId(id: string, now: number = Date.now()): void {
  metrics.overlayUnknownId++;
  metrics.lastUnknownId = id;
  metrics.lastUnknownAt = now;
}

export function recordViewerLookupFailure(): void {
  metrics.viewerLookupFailures++;
}

export function overlayMetricsSnapshot(): OverlayMetrics {
  return { ...metrics };
}

/** For tests. */
export function __resetOverlayMetrics(): void {
  metrics.overlayRequests = 0;
  metrics.overlayUnknownId = 0;
  metrics.viewerLookupFailures = 0;
  metrics.overlayRequestFailures = 0;
  metrics.lastUnknownId = null;
  metrics.lastUnknownAt = null;
}
