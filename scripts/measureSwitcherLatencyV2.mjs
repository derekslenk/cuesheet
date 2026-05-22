#!/usr/bin/env node
/**
 * Phase 4.2 — switcher latency baseline (screenshot-hash detection).
 *
 * Methodology choice: priority-3 in docs/plugin-contract.md. The
 * obs-source-switcher plugin switches the active source inside its own
 * input render path and emits NO observable WebSocket event (verified
 * 2026-05-21: discoverSwitcherEvents.mjs captured zero events across
 * ~50 subscribed event types; the OBS debug-WS log shows zero op:5
 * messages during a switch). Settings.current_index also does not
 * update at runtime. Screenshot hash polling is the only ground-truth
 * signal available.
 *
 * USAGE:
 *   node measureSwitcherLatencyV2.mjs [options]
 *
 * OPTIONS:
 *   --ws <url>           WebSocket URL (default ws://127.0.0.1:4455)
 *   --input <name>       Source-switcher input name (default ss_large)
 *   --file <path>        Polled file (default C:/OBS/source-switching/large.txt)
 *   --iterations <n>     Timed measurements (default 30)
 *   --warmup <n>         Discarded warm-up switches (default 2)
 *   --poll-ms <n>        Screenshot poll interval (default 50)
 *   --max-wait-ms <n>    Per-iteration timeout (default 3000)
 *   --width <px>         Screenshot width (default 32)
 *   --height <px>        Screenshot height (default 18)
 *   --output <path>      JSON report (default ./phase42-baseline-<ISO>.json)
 *
 * SAFETY:
 *   - Saves <file> contents at startup; restores on exit
 *     (success, error, SIGINT, SIGTERM).
 *   - Picks two values from the plugin's sources array that are != original,
 *     so every measurement switches between A↔B without touching the
 *     pre-test source.
 *   - Aborts if < 2 valid candidates exist.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import OBSWebSocket from 'obs-websocket-js';

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {
    ws: 'ws://127.0.0.1:4455',
    input: 'ss_large',
    file: 'C:/OBS/source-switching/large.txt',
    iterations: 30,
    warmup: 2,
    pollMs: 50,
    maxWaitMs: 3000,
    width: 32,
    height: 18,
    output: null,
  };
  for (let i = 0; i < args.length; i++) {
    const k = args[i];
    if (k === '--ws') out.ws = args[++i];
    else if (k === '--input') out.input = args[++i];
    else if (k === '--file') out.file = args[++i];
    else if (k === '--iterations') out.iterations = parseInt(args[++i], 10);
    else if (k === '--warmup') out.warmup = parseInt(args[++i], 10);
    else if (k === '--poll-ms') out.pollMs = parseInt(args[++i], 10);
    else if (k === '--max-wait-ms') out.maxWaitMs = parseInt(args[++i], 10);
    else if (k === '--width') out.width = parseInt(args[++i], 10);
    else if (k === '--height') out.height = parseInt(args[++i], 10);
    else if (k === '--output') out.output = args[++i];
    else if (k === '-h' || k === '--help') {
      process.stdout.write('See header comment for options.\n');
      process.exit(0);
    } else {
      process.stderr.write(`Unknown argument: ${k}\n`);
      process.exit(2);
    }
  }
  return out;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return NaN;
  const idx = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

function computeStats(samples) {
  if (samples.length === 0) {
    return { count: 0, min: NaN, max: NaN, mean: NaN, p50: NaN, p95: NaN, p99: NaN };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((s, x) => s + x, 0) / sorted.length;
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const obs = new OBSWebSocket();
  let restored = false;

  let originalContent = '';
  try { originalContent = fs.readFileSync(args.file, 'utf8'); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }

  const restoreFile = () => {
    if (restored) return;
    restored = true;
    try {
      fs.writeFileSync(args.file, originalContent);
      console.log(`[restore] wrote ${originalContent.length} bytes back to ${args.file}`);
    } catch (err) {
      console.error(`[restore] FAILED: ${err.message}`);
    }
  };
  process.on('SIGINT', () => { restoreFile(); process.exit(130); });
  process.on('SIGTERM', () => { restoreFile(); process.exit(143); });

  console.log(`[connect] ${args.ws}`);
  await obs.connect(args.ws);
  const v = await obs.call('GetVersion');
  console.log(`[connect] OBS ${v.obsVersion} / WS ${v.obsWebSocketVersion}`);

  const settings = (await obs.call('GetInputSettings', { inputName: args.input })).inputSettings ?? {};
  const sources = Array.isArray(settings.sources) ? settings.sources : [];
  const candidates = sources.map(s => String(s.value ?? '')).filter(v => v && v !== originalContent);
  if (candidates.length < 2) {
    throw new Error(`${args.input}: only ${candidates.length} value(s) != original — need >= 2`);
  }
  const valueA = candidates[0];
  const valueB = candidates[1];
  console.log(`[plan] alternating "${valueA}" ↔ "${valueB}"`);
  console.log(`[plan] iterations=${args.iterations} warmup=${args.warmup} pollMs=${args.pollMs} maxWaitMs=${args.maxWaitMs}`);

  async function snapshotHash() {
    const r = await obs.call('GetSourceScreenshot', {
      sourceName: args.input,
      imageFormat: 'jpg',
      imageWidth: args.width,
      imageHeight: args.height,
      imageCompressionQuality: 50,
    });
    return crypto.createHash('sha1').update(r.imageData).digest('hex').slice(0, 16);
  }

  async function writeAndWaitForHashChange(value) {
    const baselineHash = await snapshotHash();
    const t0 = performance.now();
    fs.writeFileSync(args.file, value);
    const deadline = t0 + args.maxWaitMs;
    let last = baselineHash;
    while (performance.now() < deadline) {
      await new Promise(r => setTimeout(r, args.pollMs));
      const h = await snapshotHash();
      if (h !== baselineHash) {
        return { ok: true, latencyMs: performance.now() - t0, baselineHash, newHash: h };
      }
      last = h;
    }
    return { ok: false, latencyMs: performance.now() - t0, baselineHash, newHash: last };
  }

  // Warm-up.
  for (let i = 0; i < args.warmup; i++) {
    const v = i % 2 === 0 ? valueA : valueB;
    const r = await writeAndWaitForHashChange(v);
    console.log(`[warmup ${i + 1}/${args.warmup}] ${v} → ${r.ok ? r.latencyMs.toFixed(0) + 'ms' : 'TIMEOUT'} (discarded)`);
  }

  // Measurement.
  const samples = [];
  const failures = [];
  for (let i = 0; i < args.iterations; i++) {
    const v = i % 2 === 0 ? valueA : valueB;
    const r = await writeAndWaitForHashChange(v);
    if (r.ok) {
      samples.push(r.latencyMs);
      if ((i + 1) % 5 === 0 || i === 0 || i + 1 === args.iterations) {
        console.log(`[meas ${i + 1}/${args.iterations}] ${v} → ${r.latencyMs.toFixed(0)}ms`);
      }
    } else {
      failures.push({ index: i, value: v });
      console.log(`[meas ${i + 1}/${args.iterations}] ${v} → TIMEOUT after ${args.maxWaitMs}ms`);
    }
  }

  restoreFile();
  await obs.disconnect();

  const stats = computeStats(samples);
  const report = {
    startedAt: new Date().toISOString(),
    obsVersion: v.obsVersion,
    obsWebSocketVersion: v.obsWebSocketVersion,
    ws: args.ws,
    input: args.input,
    file: args.file,
    iterations: args.iterations,
    warmup: args.warmup,
    pollMs: args.pollMs,
    maxWaitMs: args.maxWaitMs,
    detection: 'GetSourceScreenshot SHA-1 hash polling at pollMs cadence',
    valueA,
    valueB,
    originalContent,
    samples,
    stats,
    failures,
    sloP95WarmTargetMs: 2000,
    pass: stats.p95 <= 2000 && failures.length === 0,
  };

  const outputPath = args.output ??
    path.resolve(process.cwd(), `phase42-baseline-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log('=== Phase 4.2 latency baseline (screenshot-hash) ===');
  console.log(`Input:       ${args.input}`);
  console.log(`Samples:     ${samples.length}/${args.iterations} (${failures.length} timeouts)`);
  console.log(`Latency ms:  p50=${stats.p50.toFixed(0)} p95=${stats.p95.toFixed(0)} p99=${stats.p99.toFixed(0)} min=${stats.min.toFixed(0)} max=${stats.max.toFixed(0)} mean=${stats.mean.toFixed(0)}`);
  console.log(`Detection floor: ~${args.pollMs}ms (poll interval; true latency may be 0–${args.pollMs}ms lower per sample)`);
  console.log(`SLO p95 ≤ 2000 ms warm: ${report.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Report → ${outputPath}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch(err => {
  console.error(`fatal: ${err.message}`);
  process.exit(2);
});
