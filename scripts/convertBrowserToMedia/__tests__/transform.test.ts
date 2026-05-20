import { convertSceneJson } from '../transform';

function browserSource(name: string, url: string, extra: Record<string, unknown> = {}) {
  return {
    prev_ver: 536936450,
    name,
    uuid: 'fixed-uuid-' + name,
    id: 'browser_source',
    versioned_id: 'browser_source',
    settings: {
      audio_monitoring_type: 0,
      control_audio: true,
      url,
      width: 1920,
      height: 1080,
      shutdown: false,
      restart_when_active: false,
      reroute_audio: true,
    },
    mixers: 255,
    muted: true,
    hotkeys: { 'ObsBrowser.Refresh': [] },
    ...extra,
  };
}

function nonBrowserSource(name: string, id: string) {
  return { name, uuid: 'uuid-' + name, id, versioned_id: id, settings: {} };
}

describe('convertSceneJson', () => {
  it('converts a browser_source present in the mapping to ffmpeg_source with the UDP input URL', () => {
    const scene = {
      name: 'SaT',
      sources: [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')],
    };
    const result = convertSceneJson(scene, {
      team_alpha_main: 'udp://127.0.0.1:9001',
    });

    const converted = result.converted.sources[0];
    expect(converted.id).toBe('ffmpeg_source');
    expect(converted.versioned_id).toBe('ffmpeg_source');
    expect(converted.settings).toMatchObject({
      input: 'udp://127.0.0.1:9001',
      is_local_file: false,
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({
      name: 'team_alpha_main',
      from: 'browser_source',
      to: 'ffmpeg_source',
      twitchUrl: 'https://twitch.tv/team_alpha',
      obsInputUrl: 'udp://127.0.0.1:9001',
    });
  });

  it('preserves identity + uuid + mixers + hotkeys on the converted source', () => {
    const scene = {
      sources: [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')],
    };
    const result = convertSceneJson(scene, {
      team_alpha_main: 'udp://127.0.0.1:9001',
    });

    const converted = result.converted.sources[0];
    expect(converted.uuid).toBe('fixed-uuid-team_alpha_main');
    expect(converted.name).toBe('team_alpha_main');
    expect(converted.mixers).toBe(255);
    expect(converted.muted).toBe(true);
    expect(converted.hotkeys).toEqual({ 'ObsBrowser.Refresh': [] });
  });

  it('leaves browser_sources NOT in the mapping untouched and emits a warning', () => {
    const scene = {
      sources: [
        browserSource('team_alpha_main', 'https://twitch.tv/team_alpha'),
        browserSource('team_beta_main', 'https://twitch.tv/team_beta'),
      ],
    };
    const result = convertSceneJson(scene, {
      team_alpha_main: 'udp://127.0.0.1:9001',
    });

    expect(result.converted.sources[1]).toEqual(scene.sources[1]);
    expect(result.warnings).toEqual([
      { name: 'team_beta_main', reason: 'no UDP mapping provided' },
    ]);
  });

  it('passes through non-browser sources unchanged (scene, source_switcher, text, color)', () => {
    const scene = {
      sources: [
        nonBrowserSource('SaT', 'scene'),
        nonBrowserSource('ss_large', 'source_switcher'),
        nonBrowserSource('team_alpha_text', 'text_ft2_source_v2'),
        nonBrowserSource('team_alpha_text_bg', 'color_source_v3'),
      ],
    };
    const result = convertSceneJson(scene, {});
    expect(result.converted.sources).toEqual(scene.sources);
    expect(result.changes).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('does not mutate the input scene object (returns a new converted scene)', () => {
    const scene = {
      sources: [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')],
    };
    const snapshot = JSON.parse(JSON.stringify(scene));

    convertSceneJson(scene, { team_alpha_main: 'udp://127.0.0.1:9001' });

    expect(scene).toEqual(snapshot);
  });

  it('handles a scene file with mixed source kinds and partial mapping coverage', () => {
    const scene = {
      sources: [
        nonBrowserSource('SaT', 'scene'),
        browserSource('team_alpha_main', 'https://twitch.tv/team_alpha'),
        browserSource('team_beta_main', 'https://twitch.tv/team_beta'),
        nonBrowserSource('ss_large', 'source_switcher'),
      ],
    };
    const result = convertSceneJson(scene, {
      team_alpha_main: 'udp://127.0.0.1:9001',
      team_beta_main: 'udp://127.0.0.1:9002',
    });

    expect(result.changes.map(c => c.name).sort()).toEqual(['team_alpha_main', 'team_beta_main']);
    expect(result.warnings).toEqual([]);
    expect(result.converted.sources[0].id).toBe('scene');
    expect(result.converted.sources[1].id).toBe('ffmpeg_source');
    expect(result.converted.sources[2].id).toBe('ffmpeg_source');
    expect(result.converted.sources[3].id).toBe('source_switcher');
  });

  it('produces a diff that records both sides of each change for backup auditing', () => {
    const scene = {
      sources: [browserSource('team_alpha_main', 'https://twitch.tv/team_alpha')],
    };
    const result = convertSceneJson(scene, { team_alpha_main: 'udp://127.0.0.1:9001' });

    expect(result.diff).toEqual({
      changed: [
        {
          name: 'team_alpha_main',
          before: { id: 'browser_source', url: 'https://twitch.tv/team_alpha' },
          after: { id: 'ffmpeg_source', input: 'udp://127.0.0.1:9001' },
        },
      ],
      unchanged_browser_sources: [],
    });
  });
});
