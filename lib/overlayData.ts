/**
 * Shared contract + helpers for the HTML stream-label overlay.
 *
 * The overlay page (app/(overlay)/overlay/stream/[id]) fetches this shape from
 * GET /api/overlay/[id] and renders the label from it. Keeping the contract and
 * its resolvers here (one place, unit-tested) means the API route and any future
 * SSE channel stay in sync, and per-team branding (Phase 1 / US-003) drops in by
 * populating the optional row columns — no route or page changes required.
 */

// Event-default label palette. Mirrors lib/labelLayout.js (PLATE_COLOR
// 0xFF5A2F47 = #472f5a, ACCENT_COLOR 0xFFF1D9E0 = #e0d9f1) but expressed as CSS
// hex for the HTML overlay. Used as the fallback when a team has no per-team
// branding set.
export const EVENT_DEFAULT_COLORS = {
  bg: '#472f5a',
  accent: '#e0d9f1',
  text: '#ffffff',
} as const;

export interface OverlayColors {
  bg: string;
  accent: string;
  text: string;
}

export interface OverlayLive {
  /** Live viewer count (Phase 3 / US-006). null until a source is wired. */
  viewers: number | null;
}

export interface OverlayData {
  ok: true;
  streamId: number;
  streamerName: string;
  teamName: string;
  colors: OverlayColors;
  logoUrl: string | null;
  role: string | null;
  live: OverlayLive;
  /**
   * Event score. No data source exists yet (plan §4.7) — kept as a static
   * placeholder, never streamed, never fabricated. Remains null until a real
   * source is wired.
   */
  score: number | null;
}

/**
 * Row shape from the stream+team join used by /api/overlay/[id]. The branding
 * columns (color_*, logo_path) and role are optional: they do not exist until
 * the Phase 1 (US-003) / Phase 3 (US-006) migrations add them, so resolvers
 * fall back gracefully when they are absent.
 */
export interface OverlayStreamRow {
  id: number;
  name: string;
  team_name: string | null;
  group_name?: string | null;
  color_bg?: string | null;
  color_accent?: string | null;
  color_text?: string | null;
  logo_path?: string | null;
  role?: string | null;
}

/**
 * Resolve the effective label palette for a team, falling back to the event
 * defaults for any unset (null/empty) per-team color. A team with no branding
 * renders exactly like today's global-constant labels.
 */
export function resolveOverlayColors(
  row: Pick<OverlayStreamRow, 'color_bg' | 'color_accent' | 'color_text'>
): OverlayColors {
  return {
    bg: row.color_bg || EVENT_DEFAULT_COLORS.bg,
    accent: row.color_accent || EVENT_DEFAULT_COLORS.accent,
    text: row.color_text || EVENT_DEFAULT_COLORS.text,
  };
}

/** Assemble the overlay contract from a joined stream+team row. */
export function buildOverlayData(row: OverlayStreamRow): OverlayData {
  return {
    ok: true,
    streamId: row.id,
    streamerName: row.name,
    teamName: row.team_name || '',
    colors: resolveOverlayColors(row),
    logoUrl: row.logo_path || null,
    role: row.role || null,
    live: { viewers: null },
    score: null,
  };
}
