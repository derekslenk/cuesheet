function buildBrowserSourceSettings(url) {
  return {
    width: 1920,
    height: 1080,
    url,
    control_audio: true,
    reroute_audio: true,
    restart_when_active: false,
    shutdown: false,
    audio_monitoring_type: 0,
  };
}

function buildFfmpegSourceSettings(url) {
  return {
    input: url,
    is_local_file: false,
    // Phase 2.4 — flipped to true so OBS retries the ffmpeg_source within
    // ~2s when the upstream Streamlink-fed URL stalls (S2 kill switch).
    // Browser sources keep restart_when_active=false because URL reload
    // on scene activation causes visible flicker; ffmpeg_source resumes
    // from the network stream without re-render.
    restart_on_activate: true,
    close_when_inactive: false,
    clear_on_media_end: false,
    hw_decode: true,
    buffering_mb: 2,
  };
}

function buildStreamInputConfig({ url, useFfmpegSource = false } = {}) {
  if (useFfmpegSource) {
    return {
      inputKind: 'ffmpeg_source',
      inputSettings: buildFfmpegSourceSettings(url),
    };
  }
  return {
    inputKind: 'browser_source',
    inputSettings: buildBrowserSourceSettings(url),
  };
}

async function createStreamInput(
  { call },
  { sceneName, inputName, url, useFfmpegSource = false }
) {
  const { inputKind, inputSettings } = buildStreamInputConfig({ url, useFfmpegSource });

  await call('CreateInput', {
    sceneName,
    inputName,
    inputKind,
    inputSettings,
  });

  await call('SetInputSettings', {
    inputName,
    inputSettings,
    overlay: false,
  });

  if (!useFfmpegSource) {
    await call('SetInputMute', {
      inputName,
      inputMuted: true,
    });
  }

  return { inputKind, inputSettings };
}

module.exports = {
  buildStreamInputConfig,
  buildBrowserSourceSettings,
  buildFfmpegSourceSettings,
  createStreamInput,
};
