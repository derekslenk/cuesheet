// Deck configuration, read from environment with sensible defaults.
// Base URL follows the existing CUESHEET_URL convention (see scripts/importFromSheet.ts).

export interface DeckConfig {
  /** cuesheet web base URL (CUESHEET_URL), e.g. http://localhost:3000 */
  baseUrl: string
  /** Poll interval for GET /api/getActive (slot state), ms. */
  pollMs: number
  /** Refetch interval for teams + streams (roster), ms — picks up mid-event signups. */
  rosterRefreshMs: number
  /** Key brightness percentage, 0–100. */
  brightness: number
  /** Per-request HTTP timeout, ms. */
  requestTimeoutMs: number
}

function num(value: string | undefined, fallback: number): number {
  const n = value == null || value === '' ? NaN : Number(value)
  return Number.isFinite(n) ? n : fallback
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): DeckConfig {
  return {
    baseUrl: (env.CUESHEET_URL || 'http://localhost:3000').replace(/\/+$/, ''),
    pollMs: num(env.DECK_POLL_MS, 2000),
    rosterRefreshMs: num(env.DECK_ROSTER_REFRESH_MS, 45000),
    brightness: Math.min(100, Math.max(0, num(env.DECK_BRIGHTNESS, 80))),
    requestTimeoutMs: num(env.DECK_REQUEST_TIMEOUT_MS, 4000),
  }
}
