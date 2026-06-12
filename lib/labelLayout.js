// Unified-plate label geometry + styling for team/streamer overlays (CommonJS,
// used by createStreamGroupV2 in obsClient.js). Each stream scene gets one
// visual plate made of two flush, equal-width color boxes (team line on top,
// streamer line below) plus an accent bar down the left edge. Color sources
// have no text-measurement API, so plate width derives from the text sources'
// rendered bounds — or font-metric estimates when OBS reports unstable/zero
// sizes (race on first activation). Plate height is fixed per font size:
// text_ft2_source_v2 reports content-tight bounds (a name with no descenders
// measures shorter than one with a "p"), so measurement-based heights would
// vary between labels. All geometry AND text styling live here so the V2
// creation path is the single owner of the label look. The plate anchors to
// the left edge by default (LABEL_PLATE_ANCHOR=center restores canvas-center).

/** Font face for both label lines. Ships with Windows 10/11. */
const LABEL_FONT_FACE = 'Bahnschrift';

/** Team line: smaller, ALL CAPS, slightly muted. */
const TEAM_FONT_SIZE = 48;

/** Streamer line: the primary identity, large and bold. */
const NAME_FONT_SIZE = 84;

/** Nominal rendered line height as a multiple of font size (FT2 ascender+descender ≈ 1.2×). */
const LINE_HEIGHT_FACTOR = 1.2;

/** Vertical padding above the team line and below the streamer line. */
const LABEL_VPAD = 12;

/** Vertical gap between the two text lines inside the plate. */
const INNER_GAP = 8;

/** Width of the accent bar on the plate's left edge. */
const ACCENT_WIDTH = 8;

/** Gap between the accent bar and the text's left edge. */
const ACCENT_TEXT_GAP = 22;

/** Padding between the text's right edge and the plate's right edge. */
const PLATE_RIGHT_PAD = 30;

/** Minimum text-column width — prevents very short names from producing a tiny pill. */
const MIN_TEXT_WIDTH = 140;

/** Canvas Y coordinate of the plate's top edge. */
const PLATE_TOP_Y = 10;

/** Center-x of the 1920px canvas (anchor=center mode). */
const CANVAS_CENTER_X = 960;

/**
 * Canvas X of the plate's left edge in anchor=left mode. Left-anchoring keeps
 * the accent bar at the same x for every stream (center-anchoring makes the
 * left edge wander with name length) and keeps the plate out of the
 * center-of-screen band where game UI (boss frames, nameplates) lives.
 */
const PLATE_LEFT_MARGIN = 48;

let warnedInvalidAnchor = false;

/**
 * Plate anchor mode from LABEL_PLATE_ANCHOR: "left" (default) or "center".
 * Read at call time so a restart picks up .env.local changes. Geometry is
 * baked at stream creation — existing scenes keep their plate position until
 * the stream is deleted and re-added.
 */
function resolvePlateAnchor() {
  const raw = (process.env.LABEL_PLATE_ANCHOR || 'left').trim().toLowerCase();
  if (raw === 'left' || raw === 'center') return raw;
  if (!warnedInvalidAnchor) {
    console.warn(`Invalid LABEL_PLATE_ANCHOR "${raw}" — using "left" (valid: left, center)`);
    warnedInvalidAnchor = true;
  }
  return 'left';
}

// OBS colors are ABGR. Plate is opaque #472f5a — the Tiltify event-overlay
// bar purple (overlays.tiltify.com, 2026 theme), kept opaque because
// transparency reads as mud over bright game HUDs. Accent is #e0d9f1 from
// the event design palette — the lightest candidate, so the 8px bar stays
// visible at quadrant scale (4px) where darker tones vanish against the
// plate. Team line is white at ~85% alpha.
const PLATE_COLOR = 0xFF5A2F47;
const ACCENT_COLOR = 0xFFF1D9E0;
const TEAM_TEXT_COLOR = 0xD9FFFFFF;
const NAME_TEXT_COLOR = 0xFFFFFFFF;

/** Average advance width of LABEL_FONT_FACE Bold ≈ 0.6 × font size per char. */
function estimateTextWidth(textLength, fontSize) {
  return Math.ceil(textLength * fontSize * 0.6);
}

/**
 * Text-source settings for the (shared, per-team) team line. Sends the
 * superset of text_ft2_source_v2 keys (color1/color2) and text_gdiplus_v2
 * keys (color/opacity); each kind ignores the other's keys.
 */
function buildTeamTextSettings(teamName) {
  return {
    text: String(teamName).toUpperCase(),
    font: { face: LABEL_FONT_FACE, size: TEAM_FONT_SIZE, style: 'Regular' },
    color1: TEAM_TEXT_COLOR,
    color2: TEAM_TEXT_COLOR,
    color: 0xFFFFFFFF,
    opacity: 85,
    outline: false,
  };
}

/** Text-source settings for the (per-stream) streamer line. */
function buildNameTextSettings(streamName) {
  return {
    text: String(streamName),
    font: { face: LABEL_FONT_FACE, size: NAME_FONT_SIZE, style: 'Bold' },
    color1: NAME_TEXT_COLOR,
    color2: NAME_TEXT_COLOR,
    color: 0xFFFFFFFF,
    opacity: 100,
    outline: false,
  };
}

/**
 * Compute every position and size needed to render the unified plate.
 * Measured widths win; zero/absent measurements fall back to font-metric
 * estimates from the text lengths.
 *
 * @param {object} params
 * @param {number} params.teamTextWidth  - stable sourceWidth of the team text item (0 if never settled)
 * @param {number} params.nameTextWidth  - stable sourceWidth of the streamer text item (0 if never settled)
 * @param {number} params.teamTextLength - character count of the team name
 * @param {number} params.nameTextLength - character count of the streamer name
 * @param {('left'|'center')} [params.anchor] - plate anchoring; defaults to LABEL_PLATE_ANCHOR (env)
 */
function computeUnifiedPlateLayout({ teamTextWidth, nameTextWidth, teamTextLength, nameTextLength, anchor = resolvePlateAnchor() }) {
  const teamW = teamTextWidth || estimateTextWidth(teamTextLength, TEAM_FONT_SIZE);
  const nameW = nameTextWidth || estimateTextWidth(nameTextLength, NAME_FONT_SIZE);
  const textWidth = Math.max(teamW, nameW, MIN_TEXT_WIDTH);

  const teamLine = Math.round(TEAM_FONT_SIZE * LINE_HEIGHT_FACTOR);
  const nameLine = Math.round(NAME_FONT_SIZE * LINE_HEIGHT_FACTOR);
  const topBoxHeight = LABEL_VPAD + teamLine + INNER_GAP / 2;
  const bottomBoxHeight = INNER_GAP / 2 + nameLine + LABEL_VPAD;
  const plateHeight = topBoxHeight + bottomBoxHeight;
  const plateWidth = Math.floor(ACCENT_WIDTH + ACCENT_TEXT_GAP + textWidth + PLATE_RIGHT_PAD);
  const plateLeft = anchor === 'center'
    ? Math.round(CANVAS_CENTER_X - plateWidth / 2)
    : PLATE_LEFT_MARGIN;

  return {
    plateWidth,
    plateHeight,
    plateLeft,
    topBoxHeight,
    bottomBoxHeight,
    // Color boxes use OBS center alignment (0). In center mode this is the
    // exact canvas center (not re-derived from the rounded plateLeft).
    boxCenterX: anchor === 'center' ? CANVAS_CENTER_X : plateLeft + plateWidth / 2,
    topBoxCenterY: PLATE_TOP_Y + topBoxHeight / 2,
    bottomBoxCenterY: PLATE_TOP_Y + topBoxHeight + bottomBoxHeight / 2,
    // Text items use OBS left+vcenter alignment (1).
    textX: plateLeft + ACCENT_WIDTH + ACCENT_TEXT_GAP,
    teamTextCenterY: PLATE_TOP_Y + LABEL_VPAD + teamLine / 2,
    nameTextCenterY: PLATE_TOP_Y + LABEL_VPAD + teamLine + INNER_GAP + nameLine / 2,
    // Accent bar uses OBS top-left alignment (5).
    accentX: plateLeft,
    accentY: PLATE_TOP_Y,
  };
}

module.exports = {
  LABEL_FONT_FACE,
  TEAM_FONT_SIZE,
  NAME_FONT_SIZE,
  LINE_HEIGHT_FACTOR,
  LABEL_VPAD,
  INNER_GAP,
  ACCENT_WIDTH,
  ACCENT_TEXT_GAP,
  PLATE_RIGHT_PAD,
  MIN_TEXT_WIDTH,
  PLATE_TOP_Y,
  PLATE_LEFT_MARGIN,
  resolvePlateAnchor,
  PLATE_COLOR,
  ACCENT_COLOR,
  TEAM_TEXT_COLOR,
  NAME_TEXT_COLOR,
  estimateTextWidth,
  buildTeamTextSettings,
  buildNameTextSettings,
  computeUnifiedPlateLayout,
};
