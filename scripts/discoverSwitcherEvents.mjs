#!/usr/bin/env node
/**
 * Phase 4.2 discovery — find out which OBS WebSocket event the
 * obs-source-switcher plugin fires when it switches sources. We
 * subscribe to a broad set of plausible events, write a known value
 * to the polled file, and dump every event for the next N seconds.
 *
 * Usage:
 *   node discoverSwitcherEvents.mjs [--input ss_large] [--file C:/...] [--wait-ms 6000]
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';

const ARGS = (() => {
  const a = process.argv.slice(2);
  const out = {
    ws: 'ws://127.0.0.1:4455',
    input: 'ss_large',
    file: 'C:/OBS/source-switching/large.txt',
    waitMs: 6000,
  };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--ws') out.ws = a[++i];
    else if (k === '--input') out.input = a[++i];
    else if (k === '--file') out.file = a[++i];
    else if (k === '--wait-ms') out.waitMs = parseInt(a[++i], 10);
  }
  return out;
})();

// All v5 event names worth probing.
const EVENT_NAMES = [
  // General
  'ExitStarted','VendorEvent',
  // Config
  'CurrentSceneCollectionChanging','CurrentSceneCollectionChanged','SceneCollectionListChanged',
  'CurrentProfileChanging','CurrentProfileChanged','ProfileListChanged',
  // Scenes
  'SceneCreated','SceneRemoved','SceneNameChanged','CurrentProgramSceneChanged','CurrentPreviewSceneChanged','SceneListChanged',
  // Inputs
  'InputCreated','InputRemoved','InputNameChanged','InputSettingsChanged',
  'InputActiveStateChanged','InputShowStateChanged',
  'InputMuteStateChanged','InputVolumeChanged','InputAudioBalanceChanged','InputAudioSyncOffsetChanged','InputAudioTracksChanged','InputAudioMonitorTypeChanged',
  // Transitions
  'CurrentSceneTransitionChanged','CurrentSceneTransitionDurationChanged','SceneTransitionStarted','SceneTransitionEnded','SceneTransitionVideoEnded',
  // Filters
  'SourceFilterListReindexed','SourceFilterCreated','SourceFilterRemoved','SourceFilterNameChanged','SourceFilterEnableStateChanged',
  // Outputs
  'StreamStateChanged','RecordStateChanged','ReplayBufferStateChanged','VirtualcamStateChanged','ReplayBufferSaved',
  // Scene items
  'SceneItemCreated','SceneItemRemoved','SceneItemListReindexed','SceneItemEnableStateChanged','SceneItemLockStateChanged','SceneItemSelected','SceneItemTransformChanged',
  // Media
  'MediaInputPlaybackStarted','MediaInputPlaybackEnded','MediaInputActionTriggered',
  // Ui
  'StudioModeStateChanged','ScreenshotSaved',
];

const obs = new OBSWebSocket();

const events = [];
let t0 = 0;

function pushEvent(name, data) {
  const dtMs = performance.now() - t0;
  events.push({ dtMs: Math.round(dtMs * 10) / 10, name, data });
}

await obs.connect(ARGS.ws, undefined, { eventSubscriptions: EventSubscription.All });
const v = await obs.call('GetVersion');
console.log(`[connect] OBS ${v.obsVersion} / WS ${v.obsWebSocketVersion}`);

for (const name of EVENT_NAMES) {
  obs.on(name, data => pushEvent(name, data));
}

// Read current value + pick a different one.
const original = fs.existsSync(ARGS.file) ? fs.readFileSync(ARGS.file, 'utf8') : '';
const settings = await obs.call('GetInputSettings', { inputName: ARGS.input });
const sources = settings?.inputSettings?.sources ?? [];
const candidates = sources.map(s => String(s.value ?? '')).filter(v => v && v !== original);
if (candidates.length === 0) throw new Error('no candidates != original');
const target = candidates[0];

console.log(`[plan] original="${original}" → writing target="${target}", listening ${ARGS.waitMs}ms`);
t0 = performance.now();
fs.writeFileSync(ARGS.file, target);

await new Promise(r => setTimeout(r, ARGS.waitMs));

// Restore.
fs.writeFileSync(ARGS.file, original);
console.log(`[restore] wrote ${original.length} bytes back to ${ARGS.file}`);
await obs.disconnect();

// Report.
console.log('');
console.log(`=== events captured (${events.length}) ===`);
if (events.length === 0) {
  console.log('NONE — the plugin does not appear to fire any tracked WS event when switching.');
} else {
  for (const e of events) {
    const summary = JSON.stringify(e.data).slice(0, 180);
    console.log(`  +${String(e.dtMs).padStart(7)}ms  ${e.name}  ${summary}`);
  }
}
