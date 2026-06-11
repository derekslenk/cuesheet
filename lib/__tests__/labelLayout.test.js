const {
  LABEL_VPAD,
  LABEL_HPAD,
  MIN_LABEL_WIDTH,
  LABEL_GAP,
  computeLabelLayout,
} = require('../labelLayout');

describe('computeLabelLayout', () => {
  const FONT_SIZE = 96;

  describe('boxWidth', () => {
    it('clamps to MIN_LABEL_WIDTH for a 1-char name with no measurements', () => {
      // 1 * 96 * 0.6 + 2*30 = 57.6 + 60 = 117.6 — below MIN_LABEL_WIDTH (200)
      const { boxWidth } = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 1,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(boxWidth).toBe(MIN_LABEL_WIDTH);
    });

    it('exceeds MIN_LABEL_WIDTH for an 18-char name (kingsman265_twitch) with no measurements', () => {
      // 18 * 96 * 0.6 + 2*30 = 1036.8 + 60 = 1096.8 → 1096
      const { boxWidth } = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 18,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      const minExpected = Math.ceil(18 * FONT_SIZE * 0.6) + 2 * LABEL_HPAD;
      expect(boxWidth).toBeGreaterThanOrEqual(minExpected);
    });

    it('uses measuredWidth when provided, ignoring the character-count estimate', () => {
      const { boxWidth } = computeLabelLayout({
        measuredWidth: 1100,
        measuredHeight: 120,
        textLength: 5,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      // 1100 + 2*30 = 1160
      expect(boxWidth).toBe(Math.floor(1100 + 2 * LABEL_HPAD));
    });
  });

  describe('boxHeight', () => {
    it('adds 2×LABEL_VPAD to the measured height', () => {
      const measuredHeight = 120;
      const { boxHeight } = computeLabelLayout({
        measuredWidth: 800,
        measuredHeight,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(boxHeight).toBe(Math.floor(measuredHeight + 2 * LABEL_VPAD));
      expect(boxHeight).toBeGreaterThan(measuredHeight);
    });

    it('falls back to Math.round(fontSize * 1.3) + 2×LABEL_VPAD when measured height is 0', () => {
      const { boxHeight } = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 5,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      const expected = Math.floor(Math.round(FONT_SIZE * 1.3) + 2 * LABEL_VPAD);
      expect(boxHeight).toBe(expected);
    });
  });

  describe('centerY', () => {
    it('equals boxTopY + boxHeight / 2', () => {
      const boxTopY = 10;
      const { boxHeight, centerY } = computeLabelLayout({
        measuredWidth: 800,
        measuredHeight: 120,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY,
      });
      expect(centerY).toBe(Math.round(boxTopY + boxHeight / 2));
    });
  });

  describe('centerX', () => {
    it('is always 960 (canvas horizontal center)', () => {
      const { centerX } = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(centerX).toBe(960);
    });
  });

  describe('no-overlap: streamer label clears team box', () => {
    it('streamer box top is above streamer centerY and below team box bottom', () => {
      const teamBoxTopY = 10;
      const teamLayout = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: teamBoxTopY,
      });

      const streamerBoxTopY = teamBoxTopY + teamLayout.boxHeight + LABEL_GAP;
      const streamerLayout = computeLabelLayout({
        measuredWidth: 0,
        measuredHeight: 0,
        textLength: 18,
        fontSize: FONT_SIZE,
        boxTopY: streamerBoxTopY,
      });

      const teamBoxBottom = teamBoxTopY + teamLayout.boxHeight;
      const streamerBoxTop = streamerBoxTopY;

      // Gap between them must be at least LABEL_GAP
      expect(streamerBoxTop).toBeGreaterThanOrEqual(teamBoxBottom + LABEL_GAP);
      // Streamer center is inside its own box
      expect(streamerLayout.centerY).toBeGreaterThan(streamerBoxTop);
      expect(streamerLayout.centerY).toBeLessThan(streamerBoxTop + streamerLayout.boxHeight);
    });
  });
});
