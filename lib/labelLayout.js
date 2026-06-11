// OBS color box sizing for team/streamer label overlays (CommonJS, used by
// createStreamGroupV2 in obsClient.js). Color sources have no text-measurement
// API, so box width is derived from the text source's rendered bounds — or
// estimated from font metrics when OBS reports unstable/zero sizes (race on
// first activation). Box height is deliberately NOT measurement-based:
// text_ft2_source_v2 reports content-tight bounds (a name with no descenders
// measures shorter than one with a "p"), which would give the stacked team and
// streamer boxes visibly different heights. A fixed font-derived height keeps
// them uniform. All geometry lives here so tuning one constant fixes both labels.

/** Vertical padding above and below the nominal text line inside the box. */
const LABEL_VPAD = 12;

/** Horizontal padding added to each side of the measured/estimated text width. */
const LABEL_HPAD = 30;

/** Minimum box width — prevents very short names from producing a tiny pill. */
const MIN_LABEL_WIDTH = 200;

/** Vertical gap between the bottom of the team box and the top of the streamer box. */
const LABEL_GAP = 10;

/** Nominal rendered line height as a multiple of font size (FT2 ascender+descender ≈ 1.2×). */
const LINE_HEIGHT_FACTOR = 1.2;

/**
 * Compute the pixel dimensions and center position for a label overlay box.
 *
 * @param {object} params
 * @param {number} params.measuredWidth - stable sourceWidth from GetSceneItemTransform (0 if never settled)
 * @param {number} params.textLength    - character count of the label text (fallback estimator)
 * @param {number} params.fontSize      - OBS font size in points (e.g. 96)
 * @param {number} params.boxTopY       - canvas Y coordinate of the top edge of the color box
 * @returns {{ boxWidth: number, boxHeight: number, centerX: number, centerY: number }}
 */
function computeLabelLayout({ measuredWidth, textLength, fontSize, boxTopY }) {
  // Height: fixed per font size (see header) — independent of glyph content.
  const boxHeight = Math.round(fontSize * LINE_HEIGHT_FACTOR) + 2 * LABEL_VPAD;

  // Width: 0.6 × fontSize is a conservative average advance width for Arial Bold.
  // Measured sourceWidth wins whenever OBS has reported a stable rasterized size.
  const rawWidth = measuredWidth || Math.ceil(textLength * fontSize * 0.6);
  const boxWidth = Math.floor(Math.max(rawWidth + 2 * LABEL_HPAD, MIN_LABEL_WIDTH));

  return {
    boxWidth,
    boxHeight,
    centerX: 960, // canvas mid-point (1920 / 2)
    centerY: Math.round(boxTopY + boxHeight / 2),
  };
}

module.exports = {
  LABEL_VPAD,
  LABEL_HPAD,
  MIN_LABEL_WIDTH,
  LABEL_GAP,
  LINE_HEIGHT_FACTOR,
  computeLabelLayout,
};
