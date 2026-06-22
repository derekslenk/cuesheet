import { createStreamLookupMaps } from '../performance';

describe('createStreamLookupMaps', () => {
  it('keys sourceToIdMap by group_name once a team has been regrouped', () => {
    // Regression for the divergence bug: the reverse lookup must use the same
    // name setActive writes (group_name || team_name), not team_name alone —
    // otherwise the active source for a regrouped team maps to no stream id.
    const { sourceToIdMap } = createStreamLookupMaps([
      { id: 7, obs_source_name: 'x', name: 'Stream A', team_name: 'Original Team', group_name: 'Merged Group' },
    ]);

    expect(sourceToIdMap.get('merged_group_stream_a_stream')).toBe(7);
    expect(sourceToIdMap.has('original_team_stream_a_stream')).toBe(false);
  });

  it('falls back to team_name when no group_name is set', () => {
    const { sourceToIdMap } = createStreamLookupMaps([
      { id: 9, obs_source_name: 'y', name: 'Solo', team_name: 'Red Team', group_name: null },
    ]);

    expect(sourceToIdMap.get('red_team_solo_stream')).toBe(9);
  });
});
