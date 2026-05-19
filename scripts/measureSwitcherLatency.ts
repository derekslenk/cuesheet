/**
 * measureSwitcherLatency.ts
 *
 * Measures end-to-end latency for the file → plugin → OBS scene-change loop.
 * Establishes the p95 baseline that Phase 4.2 gates against (target: ≤ 2.0 s warm).
 *
 * USAGE:
 *   npx tsx scripts/measureSwitcherLatency.ts [options]
 *   npm run measure:switcher-latency [-- options]
 *
 * OPTIONS:
 *   --ws-url <url>      OBS WebSocket URL (default: ws://127.0.0.1:4455)
 *   --screen <name>     Switcher screen basename (default: large → ss_large)
 *   --value <name>      Stream-group value to use as test target (default: sources[0])
 *   --iterations <n>    Measurement iterations (default: 50)
 *   --no-write-docs     Skip appending results to docs/plugin-contract.md
 *
 * SAFETY:
 *   - File is restored to its original content in a try/finally — even on error.
 *   - Never writes to Windows-side files (no C:/ paths from Mac).
 *   - Polling interval and other plugin settings are never modified.
 */

import OBSWebSocket from 'obs-websocket-js';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

interface CliArgs {
  wsUrl: string;
  screen: string;
  value: string | null;
  iterations: number;
  writeDocs: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args = argv.slice(2);
  let wsUrl = 'ws://127.0.0.1:4455';
  let screen = 'large';
  let value: string | null = null;
  let iterations = 50;
  let writeDocs = true;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--ws-url':
        wsUrl = args[++i];
        break;
      case '--screen':
        screen = args[++i];
        break;
      case '--value':
        value = args[++i];
        break;
      case '--iterations':
        iterations = parseInt(args[++i], 10);
        break;
      case '--no-write-docs':
        writeDocs = false;
        break;
    }
  }

  return { wsUrl, screen, value, iterations, writeDocs };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function pct(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function computeStats(samples: number[]): {
  min: number;
  max: number;
  p50: number;
  p95: number;
  p99: number;
} {
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
  };
}

// ---------------------------------------------------------------------------
// Encoding contract check
// ---------------------------------------------------------------------------

function encodingContractCheck(filePath: string, screen: string): string {
  const lines: string[] = [`=== Encoding contract — ${screen}.txt on Mac ===`];

  let existingBuf: Buffer | null = null;
  if (fs.existsSync(filePath)) {
    existingBuf = fs.readFileSync(filePath);
  }

  if (existingBuf === null) {
    lines.push('Existing file: absent (will be created on first write)');
  } else if (existingBuf.length === 0) {
    lines.push('Existing file: 0 bytes (empty)');
  } else {
    const hasBomUtf8 =
      existingBuf.length >= 3 &&
      existingBuf[0] === 0xef &&
      existingBuf[1] === 0xbb &&
      existingBuf[2] === 0xbf;
    const hasBomUtf16le =
      existingBuf.length >= 2 &&
      existingBuf[0] === 0xff &&
      existingBuf[1] === 0xfe;
    const hasBomUtf16be =
      existingBuf.length >= 2 &&
      existingBuf[0] === 0xfe &&
      existingBuf[1] === 0xff;
    const hasTrailingNL =
      existingBuf[existingBuf.length - 1] === 0x0a ||
      existingBuf[existingBuf.length - 1] === 0x0d;

    const bomDesc = hasBomUtf8
      ? 'UTF-8 BOM present'
      : hasBomUtf16le
        ? 'UTF-16 LE BOM present'
        : hasBomUtf16be
          ? 'UTF-16 BE BOM present'
          : 'no BOM';

    lines.push(
      `Existing file: ${existingBuf.length} bytes, ${bomDesc}, trailing newline: ${hasTrailingNL}`,
    );
    lines.push(`  Hex (first 16 bytes): ${existingBuf.slice(0, 16).toString('hex')}`);
    lines.push(`  Content (UTF-8 decode): "${existingBuf.toString('utf8')}"`);

    const hasBomAny = hasBomUtf8 || hasBomUtf16le || hasBomUtf16be;
    if (!hasBomAny && !hasTrailingNL) {
      lines.push(
        'Encoding check: matches fs.writeFileSync default (UTF-8, no BOM, no trailing newline). ✅',
      );
    } else {
      lines.push('⚠️  Existing file has encoding differences that could affect plugin value matching:');
      if (hasBomAny) lines.push('    - BOM detected: plugin may not strip it (value mismatch risk)');
      if (hasTrailingNL) lines.push('    - Trailing newline: plugin may not trim it (value mismatch risk)');
    }
  }

  lines.push('');
  lines.push('fs.writeFileSync(path, str) produces: UTF-8, no BOM, no trailing newline (Node.js default)');
  lines.push('OBS source-switcher expectation: plain UTF-8, no BOM (plugin trims whitespace)');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Poll OBS until current_index reaches the target
// ---------------------------------------------------------------------------

async function pollUntilIndex(
  obs: OBSWebSocket,
  inputName: string,
  targetIndex: number,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { inputSettings } = (await obs.call('GetInputSettings', { inputName })) as {
      inputSettings: Record<string, unknown>;
    };
    if ((inputSettings.current_index as number) === targetIndex) {
      return true;
    }
    await sleep(50);
  }
  return false;
}

// ---------------------------------------------------------------------------
// Mac OBS latency measurement
// ---------------------------------------------------------------------------

async function measureMacOBS(args: CliArgs): Promise<{
  latencyReport: string;
  encodingReport: string;
  warmStats: ReturnType<typeof computeStats> | null;
}> {
  const { wsUrl, screen, iterations } = args;
  const inputName = `ss_${screen}`;
  const header = `=== Baseline latency measurement — Mac OBS (${wsUrl}) ===`;

  console.log(`\n${header}`);

  const obs = new OBSWebSocket();

  try {
    await obs.connect(wsUrl);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const report = `${header}\nSwitcher: ${inputName}\nCONNECTION FAILED: ${msg}`;
    console.error(report);
    return { latencyReport: report, encodingReport: '', warmStats: null };
  }

  console.log('Connected.\n');

  try {
    // Get live settings from OBS — file path and sources array
    const { inputSettings } = (await obs.call('GetInputSettings', { inputName })) as {
      inputSettings: Record<string, unknown>;
    };

    const filePath = inputSettings.current_source_file_path as string | undefined;
    const sources = (inputSettings.sources as Array<{ value: string }> | undefined) ?? [];

    if (!filePath) {
      throw new Error(
        `${inputName} has no current_source_file_path — did Phase 0.7.4 (remapMacObsSwitcherPaths) run?`,
      );
    }
    if (sources.length === 0) {
      throw new Error(`${inputName} has no sources configured`);
    }

    // Guard: never write to a Windows path from Mac
    if (filePath.startsWith('C:/') || filePath.startsWith('C:\\')) {
      throw new Error(
        `${inputName} still points to Windows path "${filePath}". Run npm run remap:mac-obs-switcher-paths first.`,
      );
    }

    console.log(`File path: ${filePath}`);
    console.log(`Sources in ${inputName}: ${sources.length} entries`);

    // Resolve test value — use CLI arg or first source in the live sources array
    let testValue = args.value ?? sources[0].value;
    const testIndex = sources.findIndex(s => s.value === testValue);
    if (testIndex === -1) {
      throw new Error(`Test value "${testValue}" not found in live ${inputName} sources`);
    }

    // Resolve reset value — must differ from testValue so each iteration is clean
    const resetSource = sources.find(s => s.value !== testValue);
    if (!resetSource) {
      throw new Error('Cannot find a reset value different from the test value');
    }
    const resetValue = resetSource.value;
    const resetIndex = sources.findIndex(s => s.value === resetValue);

    console.log(`Test value:  "${testValue}" (sources[${testIndex}])`);
    console.log(`Reset value: "${resetValue}" (sources[${resetIndex}])`);

    // Encoding check before touching the file
    const encodingReport = encodingContractCheck(filePath, screen);
    console.log(`\n${encodingReport}`);

    // Save original file content for unconditional restore
    const originalContent: Buffer | null = fs.existsSync(filePath)
      ? fs.readFileSync(filePath)
      : null;

    const allSamples: number[] = [];

    try {
      console.log(`\n--- Measuring ${iterations} iterations (iter 1 = cold, rest = warm) ---\n`);

      for (let i = 0; i < iterations; i++) {
        // Write reset value and wait for plugin to confirm the switch
        fs.writeFileSync(filePath, resetValue, 'utf8');
        const settled = await pollUntilIndex(obs, inputName, resetIndex, 3000);
        if (!settled) {
          console.warn(`  ⚠️  iter ${i + 1}: plugin did not reach resetIndex within 3 s — proceeding anyway`);
        }
        // Extra buffer to clear any in-flight polling cycle before we measure
        await sleep(200);

        // === Measurement window ===
        const t0 = performance.now();
        fs.writeFileSync(filePath, testValue, 'utf8');

        const switched = await pollUntilIndex(obs, inputName, testIndex, 5000);
        const t1 = performance.now();
        // ===========================

        const latencyMs = Math.round(t1 - t0);
        allSamples.push(latencyMs);

        const warmTag = i === 0 ? '(cold)' : '(warm)';
        const okTag = switched ? '' : ' ⚠️ TIMEOUT';
        console.log(
          `  iter ${String(i + 1).padStart(3)}: ${String(latencyMs).padStart(5)} ms ${warmTag}${okTag}`,
        );
      }
    } finally {
      // Always restore — even if the loop threw
      if (originalContent !== null) {
        fs.writeFileSync(filePath, originalContent);
        const preview = originalContent.toString('utf8').slice(0, 60);
        console.log(`\nRestored ${path.basename(filePath)} → "${preview}"`);
      } else {
        fs.writeFileSync(filePath, '', 'utf8');
        console.log(`\nCleared ${path.basename(filePath)} (was absent before test)`);
      }
    }

    const allStats = computeStats(allSamples);
    const warmSamples = allSamples.slice(1);
    const warmStats = warmSamples.length > 0 ? computeStats(warmSamples) : allStats;

    console.log(`\nAll ${iterations} iterations:`);
    console.log(
      `  p50=${allStats.p50} ms  p95=${allStats.p95} ms  p99=${allStats.p99} ms  min=${allStats.min} ms  max=${allStats.max} ms`,
    );
    console.log(`\nWarm (${warmSamples.length} iterations, excluding cold run):`);
    console.log(
      `  p50=${warmStats.p50} ms  p95=${warmStats.p95} ms  p99=${warmStats.p99} ms  min=${warmStats.min} ms  max=${warmStats.max} ms`,
    );

    const latencyReport = [
      header,
      `Switcher: ${inputName}`,
      `Target value: ${testValue}`,
      `File path: ${filePath}`,
      `Iterations: ${iterations} (warm: ${warmSamples.length}, cold: 1)`,
      `Latency all  (ms): p50=${allStats.p50} p95=${allStats.p95} p99=${allStats.p99} min=${allStats.min} max=${allStats.max}`,
      `Latency warm (ms): p50=${warmStats.p50} p95=${warmStats.p95} p99=${warmStats.p99} min=${warmStats.min} max=${warmStats.max}`,
    ].join('\n');

    return { latencyReport, encodingReport, warmStats };
  } finally {
    await obs.disconnect();
    console.log('\nDisconnected from Mac OBS.');
  }
}

// ---------------------------------------------------------------------------
// Windows OBS connection-only probe
// ---------------------------------------------------------------------------

async function probeWindowsOBS(wsUrl: string): Promise<string> {
  const header = `=== Windows OBS probe — ${wsUrl} ===`;
  const lines: string[] = [header];
  console.log(`\n${header}`);

  const obs = new OBSWebSocket();

  try {
    await obs.connect(wsUrl);
    lines.push('Connection: OK');
    console.log('Connection: OK');

    const { inputs } = (await obs.call('GetInputList')) as {
      inputs: Array<{ inputName: string; inputKind: string }>;
    };

    const switchers = inputs.filter(i => i.inputKind === 'source_switcher');
    lines.push(`Switchers found: ${switchers.length} (${switchers.map(s => s.inputName).join(', ')})`);
    console.log(`Switchers found: ${switchers.length}`);

    lines.push('current_source_file_path values:');
    for (const sw of switchers) {
      const { inputSettings } = (await obs.call('GetInputSettings', {
        inputName: sw.inputName,
      })) as { inputSettings: Record<string, unknown> };
      const fp = (inputSettings.current_source_file_path as string) ?? '(not set)';
      const entry = `  ${sw.inputName} → ${fp}`;
      lines.push(entry);
      console.log(entry);
    }

    await obs.disconnect();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    lines.push(`Connection: FAILED — ${msg}`);
    console.log(`Connection: FAILED — ${msg}`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Write / append to docs/plugin-contract.md
// ---------------------------------------------------------------------------

function writeToPluginContract(fullReport: string): void {
  const docsDir = path.resolve(__dirname, '../docs');
  const docsPath = path.join(docsDir, 'plugin-contract.md');
  const timestamp = new Date().toISOString();

  const section = [
    '',
    `## Phase 0.5.2 — Baseline Switcher Latency`,
    `_Measured: ${timestamp}_`,
    '',
    '```',
    fullReport,
    '```',
    '',
  ].join('\n');

  if (!fs.existsSync(docsDir)) {
    fs.mkdirSync(docsDir, { recursive: true });
  }

  if (fs.existsSync(docsPath)) {
    fs.appendFileSync(docsPath, section, 'utf8');
    console.log(`\nAppended results to ${docsPath}`);
  } else {
    const fileHeader = [
      '# Plugin Contract',
      '',
      'Baseline measurements and encoding-contract findings for the obs-source-switcher plugin.',
      'Phase 4.2 SLO gate: p95 ≤ 2000 ms (warm).',
      '',
    ].join('\n');
    fs.writeFileSync(docsPath, fileHeader + section, 'utf8');
    console.log(`\nCreated ${docsPath}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const { latencyReport, encodingReport, warmStats } = await measureMacOBS(args);

  // Windows probe only when we ran against the default Mac URL
  let windowsReport = '';
  if (args.wsUrl === 'ws://127.0.0.1:4455') {
    windowsReport = await probeWindowsOBS('ws://192.168.13.21:4455');
  }

  const fullReport = [latencyReport, encodingReport, windowsReport].filter(Boolean).join('\n\n');

  console.log('\n' + '='.repeat(60));
  console.log(fullReport);
  console.log('='.repeat(60));

  if (args.writeDocs) {
    writeToPluginContract(fullReport);
  }

  if (warmStats) {
    const sloOk = warmStats.p95 <= 2000;
    console.log(
      `\n${sloOk ? '✅' : '⚠️ '} Warm p95: ${warmStats.p95} ms (SLO target: ≤ 2000 ms — ${sloOk ? 'PASS' : 'FAIL'})`,
    );
  }
}

main().catch(err => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
