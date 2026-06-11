const {
  LABEL_VPAD,
  LABEL_HPAD,
  MIN_LABEL_WIDTH,
  LABEL_GAP,
  LINE_HEIGHT_FACTOR,
  computeLabelLayout,
} = require('../labelLayout');

describe('computeLabelLayout', () => {
  const FONT_SIZE = 96;
  const FIXED_BOX_HEIGHT = Math.round(FONT_SIZE * LINE_HEIGHT_FACTOR) + 2 * LABEL_VPAD;

  describe('boxWidth', () => {
    it('clamps to MIN_LABEL_WIDTH for a 1-char name with no measurement', () => {
      // 1 * 96 * 0.6 + 2*30 = 117.6 — below MIN_LABEL_WIDTH (200)
      const { boxWidth } = computeLabelLayout({
        measuredWidth: 0,
        textLength: 1,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(boxWidth).toBe(MIN_LABEL_WIDTH);
    });

    it('exceeds MIN_LABEL_WIDTH for an 18-char name (kingsman265_twitch) with no measurement', () => {
      const { boxWidth } = computeLabelLayout({
        measuredWidth: 0,
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
        textLength: 5,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(boxWidth).toBe(Math.floor(1100 + 2 * LABEL_HPAD));
    });
  });

  describe('boxHeight', () => {
    it('is fixed per font size regardless of measurement (content-tight FT2 bounds vary by glyphs)', () => {
      const withMeasurement = computeLabelLayout({
        measuredWidth: 543,
        textLength: 11,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      const withoutMeasurement = computeLabelLayout({
        measuredWidth: 0,
        textLength: 11,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(withMeasurement.boxHeight).toBe(FIXED_BOX_HEIGHT);
      expect(withoutMeasurement.boxHeight).toBe(FIXED_BOX_HEIGHT);
    });

    it('leaves vertical padding around the tallest FT2 line (ascender+descender ≈ 1.17×font)', () => {
      const { boxHeight } = computeLabelLayout({
        measuredWidth: 477,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      // Tallest observed real-world label: 113px for "ml7support" at 96pt.
      expect(boxHeight).toBeGreaterThanOrEqual(113 + 2 * 10);
    });
  });

  describe('centerY', () => {
    it('equals boxTopY + boxHeight / 2', () => {
      const boxTopY = 10;
      const { boxHeight, centerY } = computeLabelLayout({
        measuredWidth: 800,
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
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: 10,
      });
      expect(centerX).toBe(960);
    });
  });

  describe('no-overlap: streamer label clears team box', () => {
    it('streamer box top sits LABEL_GAP below the team box bottom and contains its centerY', () => {
      const teamBoxTopY = 10;
      const teamLayout = computeLabelLayout({
        measuredWidth: 0,
        textLength: 10,
        fontSize: FONT_SIZE,
        boxTopY: teamBoxTopY,
      });

      const streamerBoxTopY = teamBoxTopY + teamLayout.boxHeight + LABEL_GAP;
      const streamerLayout = computeLabelLayout({
        measuredWidth: 0,
        textLength: 18,
        fontSize: FONT_SIZE,
        boxTopY: streamerBoxTopY,
      });

      const teamBoxBottom = teamBoxTopY + teamLayout.boxHeight;
      expect(streamerBoxTopY).toBeGreaterThanOrEqual(teamBoxBottom + LABEL_GAP);
      expect(streamerLayout.centerY).toBeGreaterThan(streamerBoxTopY);
      expect(streamerLayout.centerY).toBeLessThan(streamerBoxTopY + streamerLayout.boxHeight);
    });
  });
});
