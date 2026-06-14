import {
  resolveOverlayColors,
  buildOverlayData,
  EVENT_DEFAULT_COLORS,
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
        live: { viewers: null },
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

    it('never fabricates score or viewers', () => {
      const d = buildOverlayData({ id: 1, name: 'X', team_name: 'Y' });
      expect(d.score).toBeNull();
      expect(d.live.viewers).toBeNull();
    });
  });
});
