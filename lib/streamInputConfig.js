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

// The subset of ffmpeg_source settings that govern preview/program playback
// behavior in Studio Mode. close_when_inactive:false keeps a preview-only (or
// hidden) source playing instead of closing; restart_on_activate (env-driven,
// see restartOnActivate()) decides whether a preview->program transition forces
// a reconnect. Extracted so it can be re-applied to ALREADY-EXISTING inputs via
// SetInputSettings with overlay:true — i.e. without re-adding streams.
function buildFfmpegPlaybackSettings() {
  return {
    // See restartOnActivate() above. Browser sources keep restart_when_active
    // false because URL reload on scene activation causes visible flicker;
    // ffmpeg_source resumes from the network stream without re-render.
    restart_on_activate: restartOnActivate(),
    close_when_inactive: false,
    clear_on_media_end: false,
  };
}

function buildFfmpegSourceSettings(url) {
  return {
    input: url,
    is_local_file: false,
    ...buildFfmpegPlaybackSettings(),
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

// Re-apply the current playback policy (restart_on_activate / close_when_inactive /
// clear_on_media_end) to every EXISTING ffmpeg_source input. Used to retrofit
// sources that were created under a different OBS_RESTART_ON_ACTIVATE value
// without deleting and re-adding the streams. overlay:true merges these flags
// over each input's existing settings, so the network URL, buffering, and
// hw_decode are preserved. Mirrors createStreamInput's { call } injection so it
// stays unit-testable with a mock OBS client.
//
// Note: changing the policy is non-disruptive — a source currently playing keeps
// playing; the new flags govern future activations (next preview->program cut).
async function applyFfmpegPlaybackSettings({ call }) {
  const { inputs } = await call('GetInputList');
  const candidates = (inputs || []).filter((i) => i.inputKind === 'ffmpeg_source');
  const settings = buildFfmpegPlaybackSettings();

  const updated = [];
  const skipped = [];
  const failed = [];
  for (const input of candidates) {
    try {
      // Only retrofit CueSheet's live network sources (the Streamlink UDP relay,
      // is_local_file:false). Local-file media — background loops, stingers,
      // intros — are user-owned: their restart_on_activate ("restart from the
      // start when shown") is a deliberate creative choice, so leave it alone.
      // looping (replay at end-of-clip) is a separate setting we never touch.
      const { inputSettings: current } = await call('GetInputSettings', {
        inputName: input.inputName,
      });
      if (current?.is_local_file !== false) {
        skipped.push(input.inputName);
        continue;
      }
      await call('SetInputSettings', {
        inputName: input.inputName,
        inputSettings: settings,
        overlay: true, // merge — preserve input URL, buffering_mb, hw_decode
      });
      updated.push(input.inputName);
    } catch (err) {
      failed.push({ inputName: input.inputName, error: err?.message || String(err) });
    }
  }

  return { total: candidates.length, updated, skipped, failed, settings };
}

module.exports = {
  buildStreamInputConfig,
  buildBrowserSourceSettings,
  buildFfmpegSourceSettings,
  buildFfmpegPlaybackSettings,
  createStreamInput,
  applyFfmpegPlaybackSettings,
};
