import { buildStreamGroupName } from '../streamGroupName';

describe('buildStreamGroupName', () => {
  it('joins team and stream names, lowercased with spaces as underscores', () => {
    expect(
      buildStreamGroupName({ name: 'Palpatine', team_name: 'Jellyfish', group_name: null })
    ).toBe('jellyfish_palpatine_stream');
  });

  it('collapses multiple/internal whitespace to single underscores', () => {
    expect(
      buildStreamGroupName({ name: 'Big  Stream', team_name: 'Red  Team', group_name: null })
    ).toBe('red_team_big_stream_stream');
  });

  it('prefers group_name over team_name when a group is set', () => {
    // This is the contract every producer/consumer of switcher names relies on:
    // once a team is regrouped, the group name — not the team name — is canonical.
    expect(
      buildStreamGroupName({ name: 'Stream A', team_name: 'Original Team', group_name: 'Merged Group' })
    ).toBe('merged_group_stream_a_stream');
  });

  it('falls back to team_name when group_name is null or undefined', () => {
    expect(
      buildStreamGroupName({ name: 'S', team_name: 'Team', group_name: null })
    ).toBe('team_s_stream');
    expect(
      buildStreamGroupName({ name: 'S', team_name: 'Team' })
    ).toBe('team_s_stream');
  });

  it('does not throw when both team_name and group_name are empty', () => {
    expect(
      buildStreamGroupName({ name: 'Solo', team_name: null, group_name: null })
    ).toBe('_solo_stream');
  });
});
