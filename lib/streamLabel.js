// HTML stream-label overlay helpers (Phase 2 / US-004).
//
// Pure / dependency-injected label logic, kept OUT of obsClient.js so it is
// directly unit-testable (obsClient.js imports the ESM-only obs-websocket-js,
// which can't be required under jest). createStreamLabelBrowserSource takes an
// injected { call } exactly like streamInputConfig.createStreamInput.

// Which label renderer createStreamGroupV2 uses. 'html' (default) = one
// transparent browser_source per stream pointing at the Next overlay page;
// 'obs' = the legacy 5-input native-text path (kept as the instant revert).
function labelRenderer() {
  return (process.env.LABEL_RENDERER || 'html').trim().toLowerCase();
}

// shutdown-when-not-visible posture for the label browser source. Default true
// bounds CEF cost (only the cell the switcher is currently showing runs a
// browser process). The Phase 2 live spike (US-005) sets this against the perf
// budget; read from env at call time so it can flip without a code change.
function labelShutdownWhenHidden() {
  const v = (process.env.LABEL_SHUTDOWN_WHEN_HIDDEN || '').trim().toLowerCase();
  if (v === '') return true;
  return !['0', 'false', 'no', 'off'].includes(v);
}

// Frame rate cap for the label browser source. The label is mostly static
// (only brief CSS entrance animations + a slow viewer poll), so a low fps cuts
// CEF CPU markedly. Default 15 — PROVISIONAL, to be confirmed by the US-005
// live spike; env-tunable (LABEL_FPS) so it can be retuned without a code
// change. Clamped to a sane integer in [1,60]; bad input falls back to 15.
function labelFps() {
  const raw = parseInt((process.env.LABEL_FPS || '').trim(), 10);
  if (!Number.isInteger(raw)) return 15;
  return Math.min(60, Math.max(1, raw));
}

// Base URL OBS's browser source uses to reach the Next app. Host-local by
// default; set LABEL_OVERLAY_BASE_URL=http://<host-ip>:3000 if OBS is remote
// (the /api auth middleware bypasses localhost/127.0.0.1/192.168.*).
function labelOverlayUrl(streamId) {
  const base = (process.env.LABEL_OVERLAY_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/overlay/stream/${streamId}`;
}

// The single per-stream label input name. Deliberately suffixed `_label` so it
// is distinct from the video source (`${group}_${stream}`) and from every
// legacy label suffix (_name_text/_name_text_bg/_team_bg/_accent) — so teardown
// matches it exactly once (see isLegacyTeamLabelInputName).
function streamLabelInputName(cleanGroupName, cleanStreamName) {
  return `${cleanGroupName}_${cleanStreamName}_label`;
}

// Predicate for the legacy per-team/per-stream NATIVE label inputs swept by
// deleteTeamComponents. Intentionally does NOT match the `_label` browser
// source (that is removed once by the generic team browser-source sweep), so a
// team teardown never double-removes the HTML label.
function isLegacyTeamLabelInputName(inputName, cleanGroupName, textSourceName) {
  return (
    inputName === `${textSourceName}_bg` ||
    (inputName.startsWith(`${cleanGroupName}_`) && (
      inputName.endsWith('_name_text') ||
      inputName.endsWith('_name_text_bg') ||
      inputName.endsWith('_team_bg') ||
      inputName.endsWith('_accent')
    ))
  );
}

// Create (or update) the one transparent browser_source that renders a stream's
// HTML label, full-canvas in its nested scene. Takes an injected { call } like
// createStreamInput so it is unit-testable with a mock OBS client.
async function createStreamLabelBrowserSource(
  { call },
  { sceneName, cleanGroupName, cleanStreamName, streamId, lockSources = true }
) {
  const inputName = streamLabelInputName(cleanGroupName, cleanStreamName);
  // Fail loud: without a streamId the URL would be /overlay/stream/undefined,
  // which renders a guaranteed NO-DATA label even though the OBS wiring
  // "succeeds". Refuse so the caller (addStream) errors and rolls back rather
  // than silently shipping a broken overlay.
  if (streamId === undefined || streamId === null) {
    throw new Error(
      `createStreamLabelBrowserSource requires a streamId for "${inputName}" — refusing to create an overlay pointing at /overlay/stream/undefined`
    );
  }
  const inputSettings = {
    url: labelOverlayUrl(streamId),
    width: 1920,
    height: 1080,
    // Cap the render framerate for this mostly-static page (fps_custom must be
    // set for OBS to honor a non-default fps). Bounds CEF CPU per label.
    fps_custom: true,
    fps: labelFps(),
    // restart_when_active:false matches the documented anti-flicker default
    // (streamInputConfig.js): under shutdown:true the page reloads on show,
    // which already replays the CSS entrance animation.
    restart_when_active: false,
    shutdown: labelShutdownWhenHidden(),
  };

  const { inputs } = await call('GetInputList');
  if (!inputs.some((i) => i.inputName === inputName)) {
    await call('CreateInput', { sceneName, inputName, inputKind: 'browser_source', inputSettings });
    console.log(`[V2] Created label browser source "${inputName}" -> ${inputSettings.url}`);
  } else {
    await call('SetInputSettings', { inputName, inputSettings, overlay: false });
    const { sceneItems } = await call('GetSceneItemList', { sceneName });
    if (!sceneItems.some((it) => it.sourceName === inputName)) {
      await call('CreateSceneItem', { sceneName, sourceName: inputName });
    }
  }

  // Labels are silent; mute via the proven SetInputMute mechanism.
  await call('SetInputMute', { inputName, inputMuted: true });

  // Full-canvas, top-left (the HTML positions the plate within 1920x1080).
  const { sceneItems } = await call('GetSceneItemList', { sceneName });
  const item = sceneItems.find((it) => it.sourceName === inputName);
  if (item) {
    await call('SetSceneItemTransform', {
      sceneName,
      sceneItemId: item.sceneItemId,
      sceneItemTransform: { positionX: 0, positionY: 0, scaleX: 1.0, scaleY: 1.0, alignment: 5 },
    });
    if (lockSources) {
      await call('SetSceneItemLocked', {
        sceneName,
        sceneItemId: item.sceneItemId,
        sceneItemLocked: true,
      }).catch((e) => console.error('[V2] Failed to lock label browser source:', e.message));
    }
  }
  return inputName;
}

module.exports = {
  labelRenderer,
  labelShutdownWhenHidden,
  labelFps,
  labelOverlayUrl,
  streamLabelInputName,
  isLegacyTeamLabelInputName,
  createStreamLabelBrowserSource,
};
