const {
  buildStreamInputConfig,
  createStreamInput,
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

    it('keeps restart_on_activate=false by default (Phase 2.4 will flip it)', () => {
      const config = buildStreamInputConfig({
        url: 'http://127.0.0.1:9001/x',
        useFfmpegSource: true,
      });
      expect(config.inputSettings.restart_on_activate).toBe(false);
    });
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
