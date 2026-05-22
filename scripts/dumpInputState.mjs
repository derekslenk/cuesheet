#!/usr/bin/env node
import fs from 'node:fs';
import { performance } from 'node:perf_hooks';
import crypto from 'node:crypto';
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

// 1. Dump ALL settings keys for ss_large (excluding the heavy sources array).
console.log('=== ss_large full settings (sources[] elided) ===');
const settings = (await obs.call('GetInputSettings', { inputName: ARGS.input })).inputSettings ?? {};
for (const [k, v] of Object.entries(settings)) {
  if (k === 'sources') continue;
  console.log(`  ${k} = ${JSON.stringify(v)}`);
}

// 2. Default input settings (the OBS-declared schema for this input kind).
console.log('');
console.log('=== input kind + defaults ===');
try {
  const info = await obs.call('GetInputDefaultSettings', { inputKind: 'source-switcher' });
  console.log(`  default keys: ${Object.keys(info.defaultInputSettings ?? {}).join(', ')}`);
} catch (err) {
  console.log(`  GetInputDefaultSettings(source-switcher) failed: ${err.message}`);
  // try other plausible kind names
  for (const kind of ['SourceSwitcher','source_switcher','obs-source-switcher','sourceswitcher_v3']) {
    try {
      const info = await obs.call('GetInputDefaultSettings', { inputKind: kind });
      console.log(`  ${kind}: keys = ${Object.keys(info.defaultInputSettings ?? {}).join(', ')}`);
      break;
    } catch {}
  }
}

// 3. Screenshot-hash probe.
const original = fs.existsSync(ARGS.file) ? fs.readFileSync(ARGS.file, 'utf8') : '';
const sourceValues = (settings.sources ?? []).map(s => String(s.value ?? '')).filter(v => v);
const target = sourceValues.find(v => v !== original) ?? sourceValues[0];

async function snapshot() {
  const r = await obs.call('GetSourceScreenshot', {
    sourceName: ARGS.input,
    imageFormat: 'jpg',
    imageWidth: 32,
    imageHeight: 18,
    imageCompressionQuality: 50,
  });
  return crypto.createHash('sha1').update(r.imageData).digest('hex').slice(0, 12);
}

console.log('');
console.log(`=== screenshot-hash probe, target="${target}" original="${original}" ===`);
const hBefore = await snapshot();
console.log(`  hash BEFORE write: ${hBefore}`);

const t0 = performance.now();
fs.writeFileSync(ARGS.file, target);

let detectedMs = null;
let lastHash = hBefore;
for (let i = 0; i < 60; i++) {
  await new Promise(r => setTimeout(r, 50));
  const h = await snapshot();
  if (h !== hBefore) {
    detectedMs = performance.now() - t0;
    lastHash = h;
    break;
  }
  lastHash = h;
}
if (detectedMs !== null) {
  console.log(`  hash CHANGED at +${detectedMs.toFixed(0)}ms (${hBefore} → ${lastHash})`);
} else {
  console.log(`  hash UNCHANGED after 3s of polling (last=${lastHash})`);
}

fs.writeFileSync(ARGS.file, original);
console.log(`[restore] wrote ${original.length} bytes back`);

// 4. After restore, did the hash come back?
await new Promise(r => setTimeout(r, 1500));
const hRestore = await snapshot();
console.log(`  hash after restore: ${hRestore} (matches BEFORE? ${hRestore === hBefore})`);

await obs.disconnect();
