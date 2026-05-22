#!/usr/bin/env node
/**
 * Phase 4.2 probe — figure out the plugin's switching mechanism.
 *
 * 1. Dump ss_large's current settings (current_source_file_path,
 *    current_source_file_interval, current_index, sources[]).
 * 2. List scene items inside ss_large (sourceName + sceneItemEnabled).
 * 3. Write a different value to the file.
 * 4. Poll scene items every 100ms for up to 5s, log when enable state changes.
 * 5. Re-query ss_large settings to see if current_index updated.
 * 6. Restore the file.
 */
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import OBSWebSocket from 'obs-websocket-js';

const ARGS = (() => {
  const a = process.argv.slice(2);
  const out = { ws: 'ws://127.0.0.1:4455', input: 'ss_large', file: 'C:/OBS/source-switching/large.txt' };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === '--ws') out.ws = a[++i];
    else if (k === '--input') out.input = a[++i];
    else if (k === '--file') out.file = a[++i];
  }
  return out;
})();

const obs = new OBSWebSocket();
await obs.connect(ARGS.ws);

const original = fs.existsSync(ARGS.file) ? fs.readFileSync(ARGS.file, 'utf8') : '';

console.log('=== ss_large settings ===');
const before = await obs.call('GetInputSettings', { inputName: ARGS.input });
const beforeSettings = before.inputSettings ?? {};
const keysOfInterest = [
  'current_source_file_path', 'current_source_file_interval', 'current_index',
  'transition_duration', 'transition', 'cycle', 'random',
];
for (const k of keysOfInterest) {
  if (k in beforeSettings) console.log(`  ${k} = ${JSON.stringify(beforeSettings[k])}`);
}
console.log(`  sources.length = ${(beforeSettings.sources ?? []).length}`);
const sourceValues = (beforeSettings.sources ?? []).map(s => String(s.value ?? ''));
console.log(`  first 3 source values: ${JSON.stringify(sourceValues.slice(0, 3))}`);

console.log('');
console.log('=== ss_large scene items (BEFORE) ===');
let items = [];
try {
  const sceneItems = await obs.call('GetSceneItemList', { sceneName: ARGS.input });
  items = sceneItems.sceneItems ?? [];
  console.log(`  ${items.length} items`);
  const enabled = items.filter(i => i.sceneItemEnabled);
  console.log(`  enabled now: ${JSON.stringify(enabled.map(i => i.sourceName))}`);
} catch (err) {
  console.log(`  GetSceneItemList failed: ${err.message}`);
  console.log(`  trying GetGroupSceneItemList...`);
  try {
    const gi = await obs.call('GetGroupSceneItemList', { sceneName: ARGS.input });
    items = gi.sceneItems ?? [];
    console.log(`  ${items.length} items (group form)`);
  } catch (err2) {
    console.log(`  GetGroupSceneItemList also failed: ${err2.message}`);
  }
}

const candidate = sourceValues.find(v => v && v !== original) ?? sourceValues[0];
console.log('');
console.log(`=== writing "${candidate}" to ${ARGS.file} (was "${original}") ===`);

const t0 = performance.now();
fs.writeFileSync(ARGS.file, candidate);

// Poll scene items every 100ms for up to 5s.
const initiallyEnabled = new Set(items.filter(i => i.sceneItemEnabled).map(i => i.sceneItemId));
let detectedAtMs = null;
let detectedItem = null;
for (let i = 0; i < 50; i++) {
  await new Promise(r => setTimeout(r, 100));
  let now;
  try {
    now = await obs.call('GetSceneItemList', { sceneName: ARGS.input });
  } catch {
    try { now = await obs.call('GetGroupSceneItemList', { sceneName: ARGS.input }); } catch { continue; }
  }
  const nowItems = now.sceneItems ?? [];
  const nowEnabled = nowItems.filter(it => it.sceneItemEnabled);
  // Detect any newly-enabled item.
  for (const en of nowEnabled) {
    if (!initiallyEnabled.has(en.sceneItemId)) {
      detectedAtMs = performance.now() - t0;
      detectedItem = en;
      break;
    }
  }
  if (detectedAtMs !== null) break;
}

if (detectedAtMs !== null) {
  console.log(`  DETECTED switch via GetSceneItemList polling at +${detectedAtMs.toFixed(0)}ms`);
  console.log(`  newly-enabled: ${JSON.stringify({ id: detectedItem.sceneItemId, sourceName: detectedItem.sourceName })}`);
} else {
  console.log(`  no scene-item enable change observed in 5s polling`);
}

console.log('');
console.log('=== ss_large settings (AFTER, 1s settle) ===');
await new Promise(r => setTimeout(r, 1000));
const after = await obs.call('GetInputSettings', { inputName: ARGS.input });
const afterSettings = after.inputSettings ?? {};
console.log(`  current_index BEFORE = ${beforeSettings.current_index} → AFTER = ${afterSettings.current_index}`);
if (beforeSettings.current_index !== afterSettings.current_index) {
  console.log(`  current_index DID change`);
} else {
  console.log(`  current_index did NOT change (consistent with plugin-contract.md methodology note)`);
}

// Restore.
fs.writeFileSync(ARGS.file, original);
console.log(`[restore] wrote ${original.length} bytes back to ${ARGS.file}`);
await obs.disconnect();
