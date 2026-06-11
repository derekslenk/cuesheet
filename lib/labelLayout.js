// OBS color box sizing for team/streamer label overlays (CommonJS, used by
// createStreamGroupV2 in obsClient.js). Color sources have no text-measurement
// API, so their width/height must be derived from the text source's rendered
// bounds — or estimated from font metrics when OBS reports 0×0 (race on first
// activation). All geometry lives here so tuning one constant fixes both labels.
//
// Why a separate module: pure functions are unit-testable without an OBS
// connection; keeping geometry out of obsClient.js makes the V2 label block
// readable and the constants easy to adjust after a visual-tuning pass against
// live OBS.

/** Vertical padding added above and below the rendered text glyph block. */
const LABEL_VPAD = 12;

/** Horizontal padding added to each side of the measured/estimated text width. */
const LABEL_HPAD = 30;

/** Minimum box width — prevents very short names from producing a tiny pill. */
const MIN_LABEL_WIDTH = 200;

/** Vertical gap between the bottom of the team box and the top of the streamer box. */
const LABEL_GAP = 10;

/**
 * Compute the pixel dimensions and center position for a label overlay box.
 *
 * @param {object} params
 * @param {number} params.measuredWidth   - sourceWidth from GetSceneItemTransform (0 if not yet rasterized)
 * @param {number} params.measuredHeight  - sourceHeight from GetSceneItemTransform (0 if not yet rasterized)
 * @param {number} params.textLength      - character count of the label text (fallback estimator)
 * @param {number} params.fontSize        - OBS font size in points (e.g. 96)
 * @param {number} params.boxTopY         - canvas Y coordinate of the top edge of the color box
 * @returns {{ boxWidth: number, boxHeight: number, centerX: number, centerY: number }}
 */
function computeLabelLayout({ measuredWidth, measuredHeight, textLength, fontSize, boxTopY }) {
  // Height: use measured glyph height when available (OBS GDI+ at size 96 renders
  // ~110-130px including ascender + descender + leading), otherwise estimate at
  // 1.3× font size.  Add vertical padding on both sides for breathing room.
  const rawHeight = measuredHeight || Math.round(fontSize * 1.3);
  const boxHeight = Math.floor(rawHeight + 2 * LABEL_VPAD);

  // Width: 0.6 × fontSize is a conservative average advance width for Arial Bold.
  // Measured sourceWidth wins whenever OBS has rasterized the source.
  const rawWidth = measuredWidth || Math.ceil(textLength * fontSize * 0.6);
  const boxWidth = Math.floor(Math.max(rawWidth + 2 * LABEL_HPAD, MIN_LABEL_WIDTH));

  // Horizontal center: hard-wired to canvas mid-point (1920 / 2).
  const centerX = 960;

  // Vertical center derived from the top edge + half the total box height.
  const centerY = Math.round(boxTopY + boxHeight / 2);

  return { boxWidth, boxHeight, centerX, centerY };
}

module.exports = {
  LABEL_VPAD,
  LABEL_HPAD,
  MIN_LABEL_WIDTH,
  LABEL_GAP,
  computeLabelLayout,
};
