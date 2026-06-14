import { planLiveSeed } from '../liveSeed';
import type { LiveStream } from '../twitch';

const mk = (n: number): LiveStream[] =>
  Array.from({ length: n }, (_, i) => ({
    login: `l${i}`,
    displayName: `D${i}`,
    viewerCount: 0,
    gameName: '',
  }));

describe('planLiveSeed', () => {
  it('round-robins streams across teams', () => {
    const teams = planLiveSeed(mk(5), 2);
    expect(teams).toHaveLength(2);
    expect(teams[0].team_id).toBe(1);
    expect(teams[0].streams.map((s) => s.login)).toEqual(['l0', 'l2', 'l4']);
    expect(teams[1].streams.map((s) => s.login)).toEqual(['l1', 'l3']);
  });

  it('gives adjacent teams distinct branding colors', () => {
    const teams = planLiveSeed(mk(2), 2);
    expect(teams[0].color_bg).not.toBe(teams[1].color_bg);
    expect(teams[0].color_accent).not.toBe(teams[1].color_accent);
  });

  it('omits teams that would be empty (more teams than streams)', () => {
    const teams = planLiveSeed(mk(1), 3);
    expect(teams).toHaveLength(1);
    expect(teams[0].streams).toHaveLength(1);
  });

  it('uses displayName, falling back to login when blank', () => {
    const teams = planLiveSeed(
      [{ login: 'abc', displayName: '', viewerCount: 0, gameName: '' }],
      1
    );
    expect(teams[0].streams[0].name).toBe('abc');
  });

  it('clamps teamCount to at least 1', () => {
    const teams = planLiveSeed(mk(3), 0);
    expect(teams).toHaveLength(1);
    expect(teams[0].streams).toHaveLength(3);
  });
});
