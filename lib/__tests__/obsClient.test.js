const {
  buildStreamInputConfig,
  buildFfmpegPlaybackSettings,
  createStreamInput,
  applyFfmpegPlaybackSettings,
} = require('../streamInputConfig');

describe('buildStreamInputConfig', () => {
  describe('browser_source (useFfmpegSource=false, V1 parity)', () => {
    it('returns inputKind=browser_source with the URL and audio controls', () => {
      const config = buildStreamInputConfig({
        url: 'https://example.com/stream',
        useFfmpegSource: false,
      });

      expect(config.inputKind).toBe('browser_source');
      expect(config.inputSettings).toMatchObject({
        width: 1920,
        height: 1080,
        url: 'https://example.com/stream',
        control_audio: true,
        reroute_audio: true,
        restart_when_active: false,
        shutdown: false,
        audio_monitoring_type: 0,
      });
    });

    it('defaults to browser_source when useFfmpegSource is omitted', () => {
      const config = buildStreamInputConfig({ url: 'https://example.com/x' });
      expect(config.inputKind).toBe('browser_source');
    });
  });

  describe('ffmpeg_source (useFfmpegSource=true, V2 new path)', () => {
    it('returns inputKind=ffmpeg_source with the URL mapped to `input` and is_local_file=false', () => {
      const config = buildStreamInputConfig({
        url: 'http://127.0.0.1:9001/stream/team_alpha.m3u8',
        useFfmpegSource: true,
      });

      expect(config.inputKind).toBe('ffmpeg_source');
      expect(config.inputSettings).toMatchObject({
        input: 'http://127.0.0.1:9001/stream/team_alpha.m3u8',
        is_local_file: false,
      });
      expect(config.inputSettings).not.toHaveProperty('url');
      expect(config.inputSettings).not.toHaveProperty('control_audio');
      expect(config.inputSettings).not.toHaveProperty('reroute_audio');
    });

    it('pins restart_on_activate=true so OBS retries when Streamlink dies (Phase 2.4)', () => {
      const config = buildStreamInputConfig({
        url: 'http://127.0.0.1:9001/x',
        useFfmpegSource: true,
      });
      expect(config.inputSettings.restart_on_activate).toBe(true);
    });
  });
});

describe('buildFfmpegPlaybackSettings (Studio Mode preview/program policy)', () => {
  const ORIGINAL = process.env.OBS_RESTART_ON_ACTIVATE;
  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.OBS_RESTART_ON_ACTIVATE;
    else process.env.OBS_RESTART_ON_ACTIVATE = ORIGINAL;
  });

  it('keeps sources warm (close_when_inactive=false, clear_on_media_end=false)', () => {
    const s = buildFfmpegPlaybackSettings();
    expect(s.close_when_inactive).toBe(false);
    expect(s.clear_on_media_end).toBe(false);
  });

  it('defaults restart_on_activate=true when env unset', () => {
    delete process.env.OBS_RESTART_ON_ACTIVATE;
    expect(buildFfmpegPlaybackSettings().restart_on_activate).toBe(true);
  });

  it('honors OBS_RESTART_ON_ACTIVATE=false (no reconnect on preview->program)', () => {
    process.env.OBS_RESTART_ON_ACTIVATE = 'false';
    expect(buildFfmpegPlaybackSettings().restart_on_activate).toBe(false);
  });

  it('does NOT include the input URL — playback flags only (safe to overlay)', () => {
    const s = buildFfmpegPlaybackSettings();
    expect(s).not.toHaveProperty('input');
    expect(s).not.toHaveProperty('is_local_file');
  });
});

describe('applyFfmpegPlaybackSettings (retrofit existing inputs)', () => {
  // is_local_file:false => CueSheet live UDP source (update it);
  // missing/true => user-owned local-file media (skip it).
  const liveSettings = { input: 'udp://127.0.0.1:9205', is_local_file: false };
  const localFileSettings = { local_file: 'C:/clips/intro.mp4', looping: true };

  it('updates only live UDP sources and skips local-file media (overlay:true)', async () => {
    const call = jest.fn(async (req, payload) => {
      if (req === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'team_a_main', inputKind: 'ffmpeg_source' },
            { inputName: 'bg_loop', inputKind: 'ffmpeg_source' }, // local file — skip
            { inputName: 'team_a_text', inputKind: 'text_gdiplus_v2' },
            { inputName: 'team_b_main', inputKind: 'ffmpeg_source' },
            { inputName: 'legacy_browser', inputKind: 'browser_source' },
          ],
        };
      }
      if (req === 'GetInputSettings') {
        return { inputSettings: payload.inputName === 'bg_loop' ? localFileSettings : liveSettings };
      }
      return {};
    });

    const result = await applyFfmpegPlaybackSettings({ call });

    const setCalls = call.mock.calls.filter(([req]) => req === 'SetInputSettings');
    expect(setCalls).toHaveLength(2);
    expect(setCalls.map(([, p]) => p.inputName)).toEqual(['team_a_main', 'team_b_main']);
    for (const [, payload] of setCalls) {
      expect(payload.overlay).toBe(true); // preserve URL / buffering / hw_decode
      expect(payload.inputSettings).toHaveProperty('restart_on_activate');
      expect(payload.inputSettings).toHaveProperty('close_when_inactive', false);
      expect(payload.inputSettings).not.toHaveProperty('input'); // never rewrite the URL
      expect(payload.inputSettings).not.toHaveProperty('looping'); // never touch looping
    }

    expect(result).toMatchObject({
      total: 3, // ffmpeg_source candidates
      updated: ['team_a_main', 'team_b_main'],
      skipped: ['bg_loop'],
      failed: [],
    });
  });

  it('collects per-input failures without aborting the whole pass', async () => {
    const call = jest.fn(async (req, payload) => {
      if (req === 'GetInputList') {
        return {
          inputs: [
            { inputName: 'ok_one', inputKind: 'ffmpeg_source' },
            { inputName: 'bad_one', inputKind: 'ffmpeg_source' },
          ],
        };
      }
      if (req === 'GetInputSettings') {
        return { inputSettings: liveSettings };
      }
      if (req === 'SetInputSettings' && payload.inputName === 'bad_one') {
        throw new Error('input not found');
      }
      return {};
    });

    const result = await applyFfmpegPlaybackSettings({ call });

    expect(result.updated).toEqual(['ok_one']);
    expect(result.failed).toEqual([{ inputName: 'bad_one', error: 'input not found' }]);
    expect(result.total).toBe(2);
  });

  it('updates nothing when every ffmpeg_source is a local file', async () => {
    const call = jest.fn(async (req) => {
      if (req === 'GetInputList') {
        return { inputs: [{ inputName: 'intro', inputKind: 'ffmpeg_source' }] };
      }
      if (req === 'GetInputSettings') {
        return { inputSettings: localFileSettings };
      }
      return {};
    });

    const result = await applyFfmpegPlaybackSettings({ call });

    expect(result.updated).toEqual([]);
    expect(result.skipped).toEqual(['intro']);
    expect(call.mock.calls.some(([req]) => req === 'SetInputSettings')).toBe(false);
  });

  it('returns total:0 and never reads settings when there are no ffmpeg_source inputs', async () => {
    const call = jest.fn(async (req) => {
      if (req === 'GetInputList') {
        return { inputs: [{ inputName: 't', inputKind: 'text_gdiplus_v2' }] };
      }
      return {};
    });

    const result = await applyFfmpegPlaybackSettings({ call });

    expect(result.total).toBe(0);
    expect(call.mock.calls.some(([req]) => req === 'GetInputSettings')).toBe(false);
    expect(call.mock.calls.some(([req]) => req === 'SetInputSettings')).toBe(false);
  });
});

describe('createStreamInput (OBS per-input choreography, V1+V2)', () => {
  function makeCall() {
    return jest.fn(async (req, payload) => {
      if (req === 'CreateInput') return { inputUuid: 'test-uuid' };
      return {};
    });
  }

  it('uses browser_source for the V1 default and mutes the source', async () => {
    const call = makeCall();

    await createStreamInput(
      { call },
      {
        sceneName: 'team_alpha',
        inputName: 'team_alpha_main',
        url: 'https://twitch.tv/team_alpha',
      }
    );

    const createCall = call.mock.calls.find(([req]) => req === 'CreateInput');
    expect(createCall[1]).toMatchObject({
      sceneName: 'team_alpha',
      inputName: 'team_alpha_main',
      inputKind: 'browser_source',
      inputSettings: { url: 'https://twitch.tv/team_alpha', control_audio: true },
    });

    const muteCall = call.mock.calls.find(([req]) => req === 'SetInputMute');
    expect(muteCall[1]).toEqual({ inputName: 'team_alpha_main', inputMuted: true });
  });

  it('uses ffmpeg_source for V2 and does NOT call SetInputMute (audio routes natively)', async () => {
    const call = makeCall();

    await createStreamInput(
      { call },
      {
        sceneName: 'team_alpha',
        inputName: 'team_alpha_main',
        url: 'http://127.0.0.1:9001/stream/team_alpha.m3u8',
        useFfmpegSource: true,
      }
    );

    const createCall = call.mock.calls.find(([req]) => req === 'CreateInput');
    expect(createCall[1]).toMatchObject({
      inputKind: 'ffmpeg_source',
      inputSettings: { input: 'http://127.0.0.1:9001/stream/team_alpha.m3u8' },
    });

    const muteCall = call.mock.calls.find(([req]) => req === 'SetInputMute');
    expect(muteCall).toBeUndefined();
  });

  it('reinforces settings with a SetInputSettings call using the same config (no overlay)', async () => {
    const call = makeCall();

    await createStreamInput(
      { call },
      {
        sceneName: 'team_alpha',
        inputName: 'team_alpha_main',
        url: 'http://127.0.0.1:9001/x',
        useFfmpegSource: true,
      }
    );

    const setCall = call.mock.calls.find(([req]) => req === 'SetInputSettings');
    expect(setCall[1]).toMatchObject({
      inputName: 'team_alpha_main',
      inputSettings: { input: 'http://127.0.0.1:9001/x', is_local_file: false },
      overlay: false,
    });
  });
});
