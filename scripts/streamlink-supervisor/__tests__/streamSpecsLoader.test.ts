import { loadStreamSpecs } from '../streamSpecsLoader';
import { loadStreamSpec, loadStreamRows, assertSafeTableName, rowToSpec } from '../streamSpecsLoader';
import { relayPort } from '../../../lib/relayPort';

describe('loadStreamSpecs', () => {
  it('maps rows to { streamId, upstreamUrl, port } using id, obs_source_name and url', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, name: 'Alpha', obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha', team_id: 1 },
        { id: 2, name: 'Beta',  obs_source_name: 'team_beta_main',  url: 'https://twitch.tv/team_beta',  team_id: 2 },
      ]),
    };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });

    expect(db.all).toHaveBeenCalledWith(
      'SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat'
    );
    expect(specs).toEqual([
      { streamId: 'team_alpha_main', upstreamUrl: 'https://twitch.tv/team_alpha', port: relayPort(1) },
      { streamId: 'team_beta_main',  upstreamUrl: 'https://twitch.tv/team_beta',  port: relayPort(2) },
    ]);
  });

  it('skips rows with missing id or empty obs_source_name / url (defensive against bad data)', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha' },
        { id: 2, obs_source_name: '',                url: 'https://twitch.tv/x' },
        { id: 3, obs_source_name: 'team_beta_main',  url: '' },
        { obs_source_name: 'team_no_id',             url: 'https://twitch.tv/team_no_id' }, // no id -> skipped
        { id: 5, obs_source_name: 'team_gamma_main', url: 'https://twitch.tv/team_gamma' },
      ]),
    };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });
    expect(specs.map(s => s.streamId)).toEqual(['team_alpha_main', 'team_gamma_main']);
    expect(specs.map(s => s.port)).toEqual([relayPort(1), relayPort(5)]);
  });

  it('excludes operator-stopped (disabled=1) streams so Stop is durable across reload', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha', disabled: 0 },
        { id: 2, obs_source_name: 'team_beta_main',  url: 'https://twitch.tv/team_beta',  disabled: 1 },
        { id: 3, obs_source_name: 'team_gamma_main', url: 'https://twitch.tv/team_gamma', disabled: null },
      ]),
    };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });
    // disabled=1 excluded; 0 and null (legacy/default) treated as enabled.
    expect(specs.map(s => s.streamId)).toEqual(['team_alpha_main', 'team_gamma_main']);
  });

  it('falls back to the legacy column set when the disabled column does not exist', async () => {
    const all = jest.fn()
      .mockRejectedValueOnce(new Error('SQLITE_ERROR: no such column: disabled'))
      .mockResolvedValueOnce([
        { id: 1, obs_source_name: 'team_alpha_main', url: 'https://twitch.tv/team_alpha' },
      ]);
    const db = { all };

    const specs = await loadStreamSpecs({ db, tableName: 'streams_2026_summer_sat' });

    expect(all).toHaveBeenNthCalledWith(1, 'SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat');
    expect(all).toHaveBeenNthCalledWith(2, 'SELECT id, obs_source_name, url FROM streams_2026_summer_sat');
    expect(specs.map(s => s.streamId)).toEqual(['team_alpha_main']);
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

describe('assertSafeTableName', () => {
  it('accepts a valid event table name', () => {
    expect(() => assertSafeTableName('streams_2026_summer_sat')).not.toThrow();
  });
  it('throws on an injection attempt', () => {
    expect(() => assertSafeTableName('streams; DROP TABLE teams;--')).toThrow(/invalid table name/i);
  });
});

describe('rowToSpec', () => {
  it('maps a row to a StreamSpec with a deterministic relay port', () => {
    expect(rowToSpec({ id: 7, obs_source_name: 'team_x', url: 'https://twitch.tv/x' })).toEqual({
      streamId: 'team_x',
      upstreamUrl: 'https://twitch.tv/x',
      port: relayPort(7),
    });
  });
});

describe('loadStreamRows', () => {
  it('selects the disabled column set and returns raw rows', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([
        { id: 1, obs_source_name: 'a', url: 'https://twitch.tv/a', disabled: 0 },
        { id: 2, obs_source_name: 'b', url: 'https://twitch.tv/b', disabled: 1 },
      ]),
    };
    const rows = await loadStreamRows({ db, tableName: 'streams_2026_summer_sat' });
    expect(db.all).toHaveBeenCalledWith('SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat');
    expect(rows.map(r => r.obs_source_name)).toEqual(['a', 'b']);
  });
});

describe('loadStreamSpec', () => {
  it('loads one stream by obs_source_name (parameterized) and maps it', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([{ id: 4, obs_source_name: 'team_q', url: 'https://twitch.tv/q', disabled: 0 }]),
    };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'team_q');
    expect(db.all).toHaveBeenCalledWith(
      'SELECT id, obs_source_name, url, disabled FROM streams_2026_summer_sat WHERE obs_source_name = ?',
      'team_q'
    );
    expect(spec).toEqual({ streamId: 'team_q', upstreamUrl: 'https://twitch.tv/q', port: relayPort(4) });
  });

  it('loads a disabled stream too (Start re-enables it)', async () => {
    const db = {
      all: jest.fn().mockResolvedValue([{ id: 4, obs_source_name: 'team_q', url: 'https://twitch.tv/q', disabled: 1 }]),
    };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'team_q');
    expect(spec?.streamId).toBe('team_q');
  });

  it('returns null when no row matches', async () => {
    const db = { all: jest.fn().mockResolvedValue([]) };
    const spec = await loadStreamSpec({ db, tableName: 'streams_2026_summer_sat' }, 'ghost');
    expect(spec).toBeNull();
  });
});
