import {
  resolveOverlayColors,
  buildOverlayData,
  EVENT_DEFAULT_COLORS,
  isHexColor,
  isSafeLogoPath,
  validateBrandingFields,
} from '../overlayData';

describe('overlayData', () => {
  describe('resolveOverlayColors', () => {
    it('falls back to event defaults when all per-team colors are unset', () => {
      expect(
        resolveOverlayColors({ color_bg: null, color_accent: null, color_text: null })
      ).toEqual(EVENT_DEFAULT_COLORS);
    });

    it('falls back per-field (set bg, default the rest)', () => {
      expect(
        resolveOverlayColors({ color_bg: '#123456', color_accent: null, color_text: null })
      ).toEqual({
        bg: '#123456',
        accent: EVENT_DEFAULT_COLORS.accent,
        text: EVENT_DEFAULT_COLORS.text,
      });
    });

    it('uses all per-team colors when present', () => {
      expect(
        resolveOverlayColors({ color_bg: '#1', color_accent: '#2', color_text: '#3' })
      ).toEqual({ bg: '#1', accent: '#2', text: '#3' });
    });

    it('treats empty strings as unset', () => {
      expect(
        resolveOverlayColors({ color_bg: '', color_accent: '', color_text: '' })
      ).toEqual(EVENT_DEFAULT_COLORS);
    });
  });

  describe('buildOverlayData', () => {
    it('assembles the full contract with defaults for a bare row', () => {
      expect(buildOverlayData({ id: 3, name: 'Streamer', team_name: 'Team' })).toEqual({
        ok: true,
        streamId: 3,
        streamerName: 'Streamer',
        teamName: 'Team',
        colors: EVENT_DEFAULT_COLORS,
        logoUrl: null,
        role: null,
        score: null,
      });
    });

    it('uses an empty teamName when team_name is null', () => {
      expect(buildOverlayData({ id: 1, name: 'X', team_name: null }).teamName).toBe('');
    });

    it('passes through per-team branding + role when present', () => {
      const d = buildOverlayData({
        id: 9,
        name: 'Ana',
        team_name: 'Reds',
        color_bg: '#aa0000',
        color_accent: '#ffcc00',
        color_text: '#000000',
        logo_path: '/logos/reds.png',
        role: 'Tank',
      });
      expect(d.colors).toEqual({ bg: '#aa0000', accent: '#ffcc00', text: '#000000' });
      expect(d.logoUrl).toBe('/logos/reds.png');
      expect(d.role).toBe('Tank');
    });

    it('never fabricates score', () => {
      const d = buildOverlayData({ id: 1, name: 'X', team_name: 'Y' });
      expect(d.score).toBeNull();
    });
  });

  describe('isHexColor', () => {
    it('accepts 3- and 6-digit hex', () => {
      expect(isHexColor('#fff')).toBe(true);
      expect(isHexColor('#e0d9f1')).toBe(true);
      expect(isHexColor('#2E9BE6')).toBe(true);
    });
    it('rejects non-hex / injection attempts', () => {
      expect(isHexColor('red')).toBe(false);
      expect(isHexColor('#12')).toBe(false);
      expect(isHexColor('#1234')).toBe(false);
      expect(isHexColor('#e0d9f1; background:url(http://evil)')).toBe(false);
      expect(isHexColor('')).toBe(false);
      expect(isHexColor('rgb(0,0,0)')).toBe(false);
    });
  });

  describe('isSafeLogoPath', () => {
    it('accepts site-relative asset paths', () => {
      expect(isSafeLogoPath('/logos/team.png')).toBe(true);
      expect(isSafeLogoPath('/logos/sub-dir/a_b.svg')).toBe(true);
    });
    it('rejects schemes, traversal, absolute URLs, and whitespace', () => {
      expect(isSafeLogoPath('http://evil/x.png')).toBe(false);
      expect(isSafeLogoPath('//evil/x.png')).toBe(false);
      expect(isSafeLogoPath('file:///etc/passwd')).toBe(false);
      expect(isSafeLogoPath('data:image/svg+xml,...')).toBe(false);
      expect(isSafeLogoPath('/logos/../../secret')).toBe(false);
      expect(isSafeLogoPath('logos/team.png')).toBe(false); // no leading slash
      expect(isSafeLogoPath('/logos/ team.png')).toBe(false); // whitespace
      expect(isSafeLogoPath('')).toBe(false);
    });
  });

  describe('validateBrandingFields', () => {
    it('passes valid colors + logo path', () => {
      expect(
        validateBrandingFields({
          color_bg: '#472f5a',
          color_accent: '#e0d9f1',
          color_text: '#ffffff',
          logo_path: '/logos/x.png',
        })
      ).toBeNull();
    });
    it('allows null (clear) and undefined (not updating) for every field', () => {
      expect(validateBrandingFields({ color_bg: null, logo_path: null })).toBeNull();
      expect(validateBrandingFields({})).toBeNull();
    });
    it('rejects a bad color', () => {
      expect(validateBrandingFields({ color_bg: 'red' })).toMatch(/color_bg/);
    });
    it('rejects an unsafe logo path', () => {
      expect(validateBrandingFields({ logo_path: 'http://evil/x.png' })).toMatch(/logo_path/);
    });
    it('rejects a non-string value', () => {
      expect(validateBrandingFields({ color_accent: 123 })).toMatch(/color_accent/);
    });
  });
});
