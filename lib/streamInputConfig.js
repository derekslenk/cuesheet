// restart_on_activate makes OBS reconnect the ffmpeg_source every time the
// source becomes active. Default true doubles as a stall kill-switch: a wedged
// upstream Streamlink feed recovers within ~2s on re-activation. The downside is
// that RAPID source-switching triggers a reconnect storm that can freeze/crash
// OBS. For switch-heavy setups set OBS_RESTART_ON_ACTIVATE=false — sources stay
// warm via close_when_inactive:false, so switching just toggles visibility with
// no reconnect (trade-off: a stalled feed won't self-heal on re-switch).
function restartOnActivate() {
  const v = (process.env.OBS_RESTART_ON_ACTIVATE || '').trim().toLowerCase();
  if (v === '') return true; // default: keep stall-recovery behavior
  return !['0', 'false', 'no', 'off'].includes(v);
}

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
    // See restartOnActivate() above. Browser sources keep restart_when_active
    // false because URL reload on scene activation causes visible flicker;
    // ffmpeg_source resumes from the network stream without re-render.
    restart_on_activate: restartOnActivate(),
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
