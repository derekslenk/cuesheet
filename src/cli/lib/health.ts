/**
 * Health polling for managed services.
 *
 * Provides a single `checkHealth()` call used by `status`, `watch`, and `gui`
 * to determine whether the supervisor and web UI are reachable. Failures are
 * captured as `up: false` — this function never throws.
 */

import type { HealthResult } from './types.js';

/** Default endpoints; callers may override via params. */
const DEFAULTS = {
  sup: { host: '127.0.0.1', port: 8080 },
  web: { host: 'localhost', port: 3000 },
} as const;

/**
 * Per-service probe timeout (ms). `next dev` compiles the first request lazily
 * and is slow to answer for several seconds after launch, so the web probe is
 * more patient than the supervisor (which answers instantly).
 */
const PROBE_TIMEOUT_MS: Record<'sup' | 'web', number> = { sup: 1500, web: 4000 };

/** Derived display state for a service, combining health + process liveness. */
export type ServiceState = 'up' | 'starting' | 'down';

/**
 * Classify a service for display:
 *   up       — health probe succeeded
 *   starting — not answering yet, but we have a live tracked PID (warming up;
 *              e.g. `next dev` is still compiling, or the port isn't bound yet)
 *   down     — not answering and no live process
 */
export function serviceState(up: boolean, hasLivePid: boolean): ServiceState {
  return up ? 'up' : hasLivePid ? 'starting' : 'down';
}

/** Glyph + short label for each state (shared by status/watch/gui). */
export const STATE_GLYPH: Record<ServiceState, { symbol: string; label: string }> = {
  up: { symbol: '✓', label: 'up' },
  starting: { symbol: '◐', label: 'start' },
  down: { symbol: '✗', label: 'DOWN' },
};

export interface HealthParams {
  /** Override supervisor host (default: 127.0.0.1). */
  supHost?: string;
  /** Override supervisor port (default: 8080). */
  supPort?: number;
  /** Override web-UI host (default: localhost). */
  webHost?: string;
  /** Override web-UI port (default: 3000). */
  webPort?: number;
}

/**
 * Probe both services concurrently and return one {@link HealthResult} per
 * service. Each probe has a hard {@link PROBE_TIMEOUT_MS} timeout; a service
 * that does not respond in time (or returns a non-2xx status) is reported as
 * `up: false` with a human-readable `detail`.
 */
export async function checkHealth(params: HealthParams = {}): Promise<HealthResult[]> {
  const supHost = params.supHost ?? DEFAULTS.sup.host;
  const supPort = params.supPort ?? DEFAULTS.sup.port;
  const webHost = params.webHost ?? DEFAULTS.web.host;
  const webPort = params.webPort ?? DEFAULTS.web.port;

  const [supResult, webResult] = await Promise.all([
    probe('sup', `http://${supHost}:${supPort}/health`, PROBE_TIMEOUT_MS.sup),
    probe('web', `http://${webHost}:${webPort}`, PROBE_TIMEOUT_MS.web),
  ]);

  return [supResult, webResult];
}

/**
 * Fetch a single URL and map the outcome to a {@link HealthResult}.
 * Never rejects — all errors become `up: false`.
 */
async function probe(service: 'sup' | 'web', url: string, timeoutMs: number): Promise<HealthResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const res = await fetch(url, { signal: controller.signal });
    const latencyMs = Date.now() - start;
    clearTimeout(timer);

    if (res.ok) {
      return { service, url, up: true, detail: `HTTP ${res.status}`, latencyMs };
    }
    return {
      service,
      url,
      up: false,
      detail: `HTTP ${res.status} ${res.statusText}`,
      latencyMs,
    };
  } catch (err: unknown) {
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    const detail = isAbortError(err)
      ? `timed out after ${timeoutMs} ms`
      : errMessage(err);
    return { service, url, up: false, detail, latencyMs };
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
