const {
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
  estimateTextWidth,
  buildTeamTextSettings,
  buildNameTextSettings,
  computeUnifiedPlateLayout,
} = require('../labelLayout');

const CHROME = ACCENT_WIDTH + ACCENT_TEXT_GAP + PLATE_RIGHT_PAD;

describe('computeUnifiedPlateLayout', () => {
  describe('plate width', () => {
    it('uses the wider of the two measured text widths', () => {
      const layout = computeUnifiedPlateLayout({
        teamTextWidth: 320,
        nameTextWidth: 732,
        teamTextLength: 11,
        nameTextLength: 15,
      });
      expect(layout.plateWidth).toBe(Math.floor(732 + CHROME));
    });

    it('falls back to per-line font-size estimates when widths never settle', () => {
      // 18-char streamer name at 96pt dominates an 11-char team name at 56pt.
      const layout = computeUnifiedPlateLayout({
        teamTextWidth: 0,
        nameTextWidth: 0,
        teamTextLength: 11,
        nameTextLength: 18,
      });
      const expectedText = Math.max(
        estimateTextWidth(11, TEAM_FONT_SIZE),
        estimateTextWidth(18, NAME_FONT_SIZE),
        MIN_TEXT_WIDTH
      );
      expect(layout.plateWidth).toBe(Math.floor(expectedText + CHROME));
      expect(layout.plateWidth).toBeGreaterThanOrEqual(Math.ceil(18 * NAME_FONT_SIZE * 0.6) + CHROME);
    });

    it('clamps very short names to MIN_TEXT_WIDTH', () => {
      const layout = computeUnifiedPlateLayout({
        teamTextWidth: 0,
        nameTextWidth: 0,
        teamTextLength: 1,
        nameTextLength: 1,
      });
      expect(layout.plateWidth).toBe(Math.floor(MIN_TEXT_WIDTH + CHROME));
    });
  });

  describe('plate geometry', () => {
    const layout = computeUnifiedPlateLayout({
      teamTextWidth: 320,
      nameTextWidth: 732,
      teamTextLength: 11,
      nameTextLength: 15,
    });
    const teamLine = Math.round(TEAM_FONT_SIZE * LINE_HEIGHT_FACTOR);
    const nameLine = Math.round(NAME_FONT_SIZE * LINE_HEIGHT_FACTOR);

    it('heights are fixed per font size, independent of measurements', () => {
      expect(layout.topBoxHeight).toBe(LABEL_VPAD + teamLine + INNER_GAP / 2);
      expect(layout.bottomBoxHeight).toBe(INNER_GAP / 2 + nameLine + LABEL_VPAD);
      expect(layout.plateHeight).toBe(layout.topBoxHeight + layout.bottomBoxHeight);
    });

    it('boxes stack flush: top box bottom == bottom box top', () => {
      const topBoxBottom = layout.topBoxCenterY + layout.topBoxHeight / 2;
      const bottomBoxTop = layout.bottomBoxCenterY - layout.bottomBoxHeight / 2;
      expect(topBoxBottom).toBe(bottomBoxTop);
      expect(layout.topBoxCenterY - layout.topBoxHeight / 2).toBe(PLATE_TOP_Y);
    });

    it('plate is left-anchored by default at PLATE_LEFT_MARGIN', () => {
      expect(layout.plateLeft).toBe(PLATE_LEFT_MARGIN);
      expect(layout.boxCenterX).toBe(PLATE_LEFT_MARGIN + layout.plateWidth / 2);
    });

    it('text lines anchor inside their boxes with the accent + gap offset', () => {
      expect(layout.textX).toBe(layout.plateLeft + ACCENT_WIDTH + ACCENT_TEXT_GAP);
      // Team line center sits inside the top box.
      expect(layout.teamTextCenterY).toBeGreaterThan(PLATE_TOP_Y);
      expect(layout.teamTextCenterY).toBeLessThan(PLATE_TOP_Y + layout.topBoxHeight);
      // Streamer line center sits inside the bottom box.
      expect(layout.nameTextCenterY).toBeGreaterThan(PLATE_TOP_Y + layout.topBoxHeight);
      expect(layout.nameTextCenterY).toBeLessThan(PLATE_TOP_Y + layout.plateHeight);
    });

    it('accent bar spans the full plate height at its left edge', () => {
      expect(layout.accentX).toBe(layout.plateLeft);
      expect(layout.accentY).toBe(PLATE_TOP_Y);
    });
  });

  describe('anchor modes (LABEL_PLATE_ANCHOR)', () => {
    const MEASURED = {
      teamTextWidth: 320,
      nameTextWidth: 732,
      teamTextLength: 11,
      nameTextLength: 15,
    };
    const ORIGINAL_ENV = process.env.LABEL_PLATE_ANCHOR;

    afterEach(() => {
      if (ORIGINAL_ENV === undefined) delete process.env.LABEL_PLATE_ANCHOR;
      else process.env.LABEL_PLATE_ANCHOR = ORIGINAL_ENV;
    });

    it('anchor:"center" centers the plate on the 1920px canvas', () => {
      const layout = computeUnifiedPlateLayout({ ...MEASURED, anchor: 'center' });
      expect(layout.boxCenterX).toBe(960);
      expect(layout.plateLeft).toBe(Math.round(960 - layout.plateWidth / 2));
      expect(layout.textX).toBe(layout.plateLeft + ACCENT_WIDTH + ACCENT_TEXT_GAP);
      expect(layout.accentX).toBe(layout.plateLeft);
    });

    it('LABEL_PLATE_ANCHOR=center selects center mode via env', () => {
      process.env.LABEL_PLATE_ANCHOR = 'center';
      expect(resolvePlateAnchor()).toBe('center');
      const layout = computeUnifiedPlateLayout(MEASURED);
      expect(layout.boxCenterX).toBe(960);
    });

    it('unset and invalid env values fall back to left', () => {
      delete process.env.LABEL_PLATE_ANCHOR;
      expect(resolvePlateAnchor()).toBe('left');
      process.env.LABEL_PLATE_ANCHOR = 'middle-ish';
      expect(resolvePlateAnchor()).toBe('left');
      const layout = computeUnifiedPlateLayout(MEASURED);
      expect(layout.plateLeft).toBe(PLATE_LEFT_MARGIN);
    });

    it('anchor only moves the plate horizontally — vertical geometry is identical', () => {
      const left = computeUnifiedPlateLayout({ ...MEASURED, anchor: 'left' });
      const center = computeUnifiedPlateLayout({ ...MEASURED, anchor: 'center' });
      expect(left.plateWidth).toBe(center.plateWidth);
      expect(left.plateHeight).toBe(center.plateHeight);
      expect(left.topBoxCenterY).toBe(center.topBoxCenterY);
      expect(left.bottomBoxCenterY).toBe(center.bottomBoxCenterY);
      expect(left.teamTextCenterY).toBe(center.teamTextCenterY);
      expect(left.nameTextCenterY).toBe(center.nameTextCenterY);
      expect(left.accentY).toBe(center.accentY);
    });
  });
});

describe('text settings builders', () => {
  it('team line is uppercase, smaller, regular weight, no outline', () => {
    const settings = buildTeamTextSettings('Test Team 2');
    expect(settings.text).toBe('TEST TEAM 2');
    expect(settings.font.size).toBe(TEAM_FONT_SIZE);
    expect(settings.font.style).toBe('Regular');
    expect(settings.outline).toBe(false);
  });

  it('streamer line keeps its exact name, large bold, no outline', () => {
    const settings = buildNameTextSettings('ml7support');
    expect(settings.text).toBe('ml7support');
    expect(settings.font.size).toBe(NAME_FONT_SIZE);
    expect(settings.font.style).toBe('Bold');
    expect(settings.outline).toBe(false);
  });

  it('both lines use the same font face', () => {
    expect(buildTeamTextSettings('x').font.face).toBe(buildNameTextSettings('x').font.face);
  });
});
