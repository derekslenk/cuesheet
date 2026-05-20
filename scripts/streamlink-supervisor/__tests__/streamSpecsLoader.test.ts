import { loadStreamSpecs } from '../streamSpecsLoader';

describe('loadStreamSpecs', () => {
  it('maps streams rows to { streamId, upstreamUrl } using obs_source_name and url', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, name: 'Alpha', obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha', team_id: 1 },
        { id: 2, name: 'Beta',  obs_source_name: 'team_beta_main',  url: 'https://twitch.tv/team_beta',  team_id: 2 },
      ]),
    };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });

    expect(db.all).toHaveBeenCalledWith(
      'SELECT obs_source_name, url FROM streams_2026_summer_sat'
    );
    expect(specs).toEqual([
      { streamId: 'team_alpha_main', upstreamUrl: 'https://twitch.tv/team_alpha' },
      { streamId: 'team_beta_main',  upstreamUrl: 'https://twitch.tv/team_beta'  },
    ]);
  });

  it('skips rows with missing or empty obs_source_name / url (defensive against bad data)', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha' },
        { obs_source_name: '',                url: 'https://twitch.tv/x' },
        { obs_source_name: 'team_beta_main',  url: '' },
        { obs_source_name: 'team_gamma_main', url: 'https://twitch.tv/team_gamma' },
      ]),
    };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });
    expect(specs.map(s => s.streamId)).toEqual(['team_alpha_main', 'team_gamma_main']);
  });

  it('returns an empty array when the table has no rows', async () => {
    const db = { all: jest.fn().mockResolvedValue([]) };
    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });
    expect(specs).toEqual([]);
  });

  it('rejects table names that are not safe SQL identifiers (defense against injection via env var)', async () => {
    const db = { all: jest.fn() };
    await expect(
      loadStreamSpecs({ db, tableName: 'streams; DROP TABLE teams;--' })
    ).rejects.toThrow(/invalid table name/i);
    expect(db.all).not.toHaveBeenCalled();
  });
});
