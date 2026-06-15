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

export interface OverlayData {
  ok: true;
  streamId: number;
  streamerName: string;
  teamName: string;
  colors: OverlayColors;
  logoUrl: string | null;
  role: string | null;
  /**
   * The live viewer count is NOT part of this contract — it is polled
   * separately from GET /api/overlay/[id]/viewers (slow-changing, best-effort)
   * and held in the StreamLabel component's own state.
   *
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

/** A 3- or 6-digit CSS hex color (e.g. #e0d9f1). */
export function isHexColor(value: string): boolean {
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
}

/**
 * A safe, site-relative logo path (e.g. /logos/team.png). Must start with a
 * single slash and contain only a conservative path charset — no scheme
 * (`:` is excluded so `http:`/`file:`/`data:` can't appear), no `..` traversal,
 * no whitespace. This keeps an operator-set logo confined to the app's own
 * assets and prevents the OBS browser source from being pointed at an
 * untrusted/local resource via <img src>.
 */
export function isSafeLogoPath(value: string): boolean {
  return /^\/[A-Za-z0-9][A-Za-z0-9._\-/]*$/.test(value) && !value.includes('..');
}

/**
 * Validate the per-team branding subset of a PUT body. Each field is optional;
 * `null` is allowed (it clears the value back to the event default). Returns an
 * error message for the first invalid field, or null if all provided values are
 * safe. Guards the unauthenticated-on-LAN write path so only sane values ever
 * reach the overlay's inline CSS / <img src>.
 */
export function validateBrandingFields(fields: {
  color_bg?: unknown;
  color_accent?: unknown;
  color_text?: unknown;
  logo_path?: unknown;
}): string | null {
  const colorKeys = ['color_bg', 'color_accent', 'color_text'] as const;
  for (const key of colorKeys) {
    const v = fields[key];
    if (v === undefined || v === null) continue;
    if (typeof v !== 'string' || !isHexColor(v)) {
      return `${key} must be a hex color like #2e9be6 (or null to clear)`;
    }
  }
  const lp = fields.logo_path;
  if (lp !== undefined && lp !== null) {
    if (typeof lp !== 'string' || !isSafeLogoPath(lp)) {
      return 'logo_path must be a site-relative path like /logos/team.png (or null to clear)';
    }
  }
  return null;
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
    score: null,
  };
}
