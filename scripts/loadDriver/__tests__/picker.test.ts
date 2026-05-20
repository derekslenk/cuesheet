import { createPicker } from '../picker';
import type { StreamRecord } from '../picker';

const streams: StreamRecord[] = [
  { id: 1, name: 'Alpha', team_name: 'Team One', group_name: null },
  { id: 2, name: 'Bravo', team_name: 'Team Two', group_name: 'team_two_scene' },
  { id: 3, name: 'Charlie', team_name: 'Team Three', group_name: null },
];

const screens = ['large', 'left', 'right'] as const;

describe('createPicker (round-robin)', () => {
  it('cycles through streams × screens deterministically', () => {
    const picker = createPicker(streams, [...screens]);
    const got = Array.from({ length: 6 }, () => picker());
    expect(got[0].streamId).toBe(1);
    expect(got[0].screen).toBe('large');
    expect(got[1].streamId).toBe(2);
    expect(got[1].screen).toBe('left');
    expect(got[2].streamId).toBe(3);
    expect(got[2].screen).toBe('right');
    expect(got[3].streamId).toBe(1);
    expect(got[3].screen).toBe('large');
  });

  it('builds expectedGroupName using stream.group_name when present', () => {
    const picker = createPicker(streams, [...screens]);
    const got = [picker(), picker(), picker()];
    expect(got[0].expectedGroupName).toBe('team_one_alpha_stream');
    expect(got[1].expectedGroupName).toBe('team_two_scene_bravo_stream');
    expect(got[2].expectedGroupName).toBe('team_three_charlie_stream');
  });

  it('lowercases and underscore-joins multi-word names (matches setActive)', () => {
    const picker = createPicker(
      [{ id: 9, name: 'Some Long Feed', team_name: 'Two Word Team', group_name: null }],
      ['large']
    );
    expect(picker().expectedGroupName).toBe('two_word_team_some_long_feed_stream');
  });

  it('throws when streams or screens are empty', () => {
    expect(() => createPicker([], ['large'])).toThrow();
    expect(() => createPicker(streams, [])).toThrow();
  });
});
