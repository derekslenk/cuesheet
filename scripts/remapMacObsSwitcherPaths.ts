/**
 * remapMacObsSwitcherPaths.ts
 *
 * Remaps the 7 obs-source-switcher inputs in the Mac OBS from Windows paths
 * (C:/OBS/source-switching/*.txt) to Mac-side paths.
 *
 * WHEN TO RE-RUN:
 *   - After re-importing the Windows scene-collection on the Mac OBS
 *   - Any time GetInputSettings shows a C:/ path for current_source_file_path
 *
 * DEFAULT PATHS:
 *   OBS WebSocket: ws://127.0.0.1:4455 (no auth)
 *   Target dir: /Users/slenk/projects/obs-ss-plugin-webui/obs-scene/source-switching/
 *   File per screen: <targetDir>/<screen>.txt  (e.g. large.txt, left.txt, …)
 *
 * CAVEATS:
 *   - Uses overlay:true on SetInputSettings so polling interval and other
 *     settings are preserved.
 *   - Does NOT change current_source_file_interval.
 *   - Idempotent: skips any switcher whose path already matches the target.
 *   - End-to-end plugin reaction (did OBS actually switch scenes?) is a manual
 *     test; this script only confirms the path setting was accepted.
 *
 * USAGE:
 *   npx tsx scripts/remapMacObsSwitcherPaths.ts [--dry-run] [--target-dir <path>]
 *     [--host <host>] [--port <port>] [--password <password>]
 */

import OBSWebSocket from 'obs-websocket-js';
import path from 'path';
import fs from 'fs';
import { SOURCE_SWITCHER_NAMES, SCREEN_POSITIONS } from '../lib/constants';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): {
  dryRun: boolean;
  targetDir: string;
  host: string;
  port: string;
  password: string;
} {
  const args = argv.slice(2);
  let dryRun = false;
  let targetDir = path.resolve(
    __dirname,
    '../obs-scene/source-switching'
  );
  let host = '127.0.0.1';
  let port = '4455';
  let password = '';

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        dryRun = true;
        break;
      case '--target-dir':
        targetDir = args[++i];
        break;
      case '--host':
        host = args[++i];
        break;
      case '--port':
        port = args[++i];
        break;
      case '--password':
        password = args[++i];
        break;
    }
  }

  return { dryRun, targetDir, host, port, password };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const { dryRun, targetDir, host, port, password } = parseArgs(process.argv);

  if (dryRun) {
    console.log('[DRY RUN] No changes will be written to OBS.\n');
  }

  console.log(`Connecting to ws://${host}:${port}...`);

  const obs = new OBSWebSocket();

  try {
    await obs.connect(`ws://${host}:${port}`, password || undefined);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`ERROR: Cannot reach OBS WebSocket at ws://${host}:${port}: ${message}`);
    process.exit(1);
  }

  console.log('Connected.\n');

  // Verify target dir exists (warn but don't abort — OBS just needs the path string)
  if (!fs.existsSync(targetDir)) {
    console.warn(`WARNING: targetDir does not exist on disk: ${targetDir}`);
    console.warn('  Creating it so smoke-test file write can proceed...');
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // Build mapping: inputName → desired Mac path
  // SOURCE_SWITCHER_NAMES = ['ss_large', …], SCREEN_POSITIONS = ['large', …]
  const switcherMap: Array<{ inputName: string; screenName: string; desiredPath: string }> =
    SOURCE_SWITCHER_NAMES.map((inputName, i) => ({
      inputName,
      screenName: SCREEN_POSITIONS[i],
      desiredPath: path.join(targetDir, `${SCREEN_POSITIONS[i]}.txt`),
    }));

  // ---------------------------------------------------------------------------
  // Step 1: Dry-run print — show current → desired for each switcher
  // ---------------------------------------------------------------------------

  console.log('=== Current → Desired paths ===');
  const currentPaths: Record<string, string> = {};

  for (const { inputName, desiredPath } of switcherMap) {
    const { inputSettings } = await obs.call('GetInputSettings', { inputName }) as {
      inputSettings: Record<string, unknown>;
    };
    const currentPath = (inputSettings.current_source_file_path as string) ?? '(not set)';
    currentPaths[inputName] = currentPath;

    const alreadyCorrect = currentPath === desiredPath;
    const tag = alreadyCorrect ? '(already correct)' : (dryRun ? '[would update]' : '[will update]');
    console.log(`  ${inputName}: ${currentPath} → ${desiredPath}  ${tag}`);
  }

  console.log('');

  // ---------------------------------------------------------------------------
  // Step 2: Apply changes (unless dry run)
  // ---------------------------------------------------------------------------

  if (dryRun) {
    console.log('[DRY RUN] Skipping SetInputSettings calls.');
  } else {
    let updatedCount = 0;
    let skippedCount = 0;

    for (const { inputName, desiredPath } of switcherMap) {
      const currentPath = currentPaths[inputName];

      if (currentPath === desiredPath) {
        console.log(`  SKIP  ${inputName} (already correct)`);
        skippedCount++;
        continue;
      }

      await obs.call('SetInputSettings', {
        inputName,
        inputSettings: { current_source_file_path: desiredPath },
        overlay: true,
      });

      console.log(`  SET   ${inputName}: ${currentPath} → ${desiredPath}`);
      updatedCount++;
    }

    console.log(`\nRemapped ${updatedCount} switcher(s), skipped ${skippedCount} (already correct).`);

    // -------------------------------------------------------------------------
    // Step 3: Verify — re-read and confirm paths stuck
    // -------------------------------------------------------------------------

    console.log('\n=== Verification (re-read) ===');
    let verifiedCount = 0;
    let failedCount = 0;

    for (const { inputName, desiredPath } of switcherMap) {
      const { inputSettings } = await obs.call('GetInputSettings', { inputName }) as {
        inputSettings: Record<string, unknown>;
      };
      const readBackPath = (inputSettings.current_source_file_path as string) ?? '(not set)';
      const ok = readBackPath === desiredPath;

      if (ok) {
        console.log(`  ✅  ${inputName}: ${readBackPath}`);
        verifiedCount++;
      } else {
        console.log(`  ❌  ${inputName}: expected ${desiredPath}, got ${readBackPath}`);
        failedCount++;
      }
    }

    console.log(`\nVerified: ${verifiedCount}/${switcherMap.length} switchers updated.`);

    if (failedCount > 0) {
      console.error(`ERROR: ${failedCount} switcher(s) did not take the new path.`);
      await obs.disconnect();
      process.exit(1);
    }

    // -------------------------------------------------------------------------
    // Step 4: Smoke test on ss_large / large.txt
    // -------------------------------------------------------------------------

    console.log('\n=== Smoke test (ss_large) ===');
    const smokeFile = path.join(targetDir, 'large.txt');
    const smokeContent = `test-remap-${Date.now()}`;
    const previousContent = fs.existsSync(smokeFile)
      ? fs.readFileSync(smokeFile, 'utf8')
      : null;

    try {
      console.log(`  Writing "${smokeContent}" to ${smokeFile}`);
      fs.writeFileSync(smokeFile, smokeContent, 'utf8');

      // Wait one polling interval + buffer (1 s default + 500 ms buffer)
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Confirm the plugin's setting is still healthy (current_source_file still present)
      const { inputSettings: afterSettings } = await obs.call('GetInputSettings', {
        inputName: 'ss_large',
      }) as { inputSettings: Record<string, unknown> };

      const pathAfter = afterSettings.current_source_file_path as string;
      const fileEnabled = afterSettings.current_source_file !== false; // undefined = enabled by default

      if (pathAfter === path.join(targetDir, 'large.txt') && fileEnabled) {
        console.log(`  ✅  ss_large settings still healthy after file write.`);
        console.log(`      current_source_file_path: ${pathAfter}`);
        console.log(`      current_source_file (enabled): ${fileEnabled}`);
      } else {
        console.warn(`  ⚠️   ss_large settings look unexpected after smoke test:`);
        console.warn(`      current_source_file_path: ${pathAfter}`);
        console.warn(`      current_source_file: ${afterSettings.current_source_file}`);
      }
    } finally {
      // Restore previous content or remove the test file
      if (previousContent !== null) {
        fs.writeFileSync(smokeFile, previousContent, 'utf8');
        console.log(`  Restored ${smokeFile} to previous content.`);
      } else {
        fs.writeFileSync(smokeFile, '', 'utf8');
        console.log(`  Cleared ${smokeFile} (was empty/absent before smoke test).`);
      }
    }
  }

  await obs.disconnect();
  console.log('\nDone. Re-run after each Mac OBS scene re-import.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
