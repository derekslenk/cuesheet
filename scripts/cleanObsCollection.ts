/**
 * cleanObsCollection.ts
 *
 * Removes a previous season's stream-group scenes (and their orphaned source
 * inputs) from an OBS scene collection, leaving the production-infrastructure
 * scenes and the 7 obs-source-switcher inputs intact and ready to be
 * repopulated by the webui for the new season.
 *
 * What it does (in --apply mode):
 *   1. Moves the program scene to a safe kept scene.
 *   2. Removes every scene NOT in the keep-set (team groups + their *_stream scenes).
 *   3. Removes inputs left orphaned by those deletions (browser/text/color sources
 *      that are no longer referenced by any kept scene). Never touches source_switchers.
 *   4. Clears each source_switcher's `sources[]` to empty (preserving
 *      current_source_file_path + current_source_file_interval) and resets current_index.
 *
 * SAFE BY DEFAULT: with no --apply flag it only LISTS what it would do (read-only).
 *
 * PLUGIN-PIN CAVEAT: the obs-source-switcher plugin keeps its last-displayed
 * source pinned in OBS runtime even after sources[] is emptied, so a handful of
 * inputs may resist RemoveInput (it silently no-ops). Restart OBS, then re-run
 * with --sweep-orphans to remove the stragglers.
 *
 * ALWAYS back up the scene collection first. macOS:
 *   ~/Library/Application Support/obs-studio/basic/scenes/*.json
 * Windows (Scoop): %USERPROFILE%\scoop\persist\obs-studio\config\obs-studio\basic\scenes\*.json
 *
 * USAGE:
 *   # Dry-run (read-only) against local OBS:
 *   npx tsx scripts/cleanObsCollection.ts
 *
 *   # Dry-run against the Windows prod host (LAN or Tailscale):
 *   npx tsx scripts/cleanObsCollection.ts --host 192.168.13.21
 *
 *   # Apply the cleanup:
 *   npx tsx scripts/cleanObsCollection.ts --host 192.168.13.21 --apply
 *
 *   # After restarting OBS, sweep any plugin-pinned input stragglers:
 *   npx tsx scripts/cleanObsCollection.ts --host 192.168.13.21 --sweep-orphans
 *
 * FLAGS:
 *   --apply              Perform changes (default is read-only list).
 *   --sweep-orphans      Only remove orphaned inputs (post-OBS-restart cleanup).
 *   --host <h>           OBS WebSocket host (default 127.0.0.1).
 *   --port <p>           OBS WebSocket port (default 4455).
 *   --password <pw>      OBS WebSocket password (default none).
 *   --keep <a,b,c>       Comma-separated scene names to KEEP (default: infra set below).
 *   --safe-scene <name>  Scene to switch program to before deleting (default: auto).
 */

import OBSWebSocket from 'obs-websocket-js';

// Production-infrastructure scenes kept across seasons. Override with --keep.
const DEFAULT_KEEP = [
  'Movies', 'Audio', 'Resources', 'Ending', 'Starting',
  'Donor', 'BRB', '4-Screen', '2-Screen', '1-Screen',
];

interface Opts {
  apply: boolean;
  sweepOrphans: boolean;
  host: string;
  port: string;
  password: string;
  keep: string[];
  safeScene?: string;
}

function parseArgs(argv: string[]): Opts {
  const args = argv.slice(2);
  const o: Opts = {
    apply: false, sweepOrphans: false,
    host: '127.0.0.1', port: '4455', password: '', keep: DEFAULT_KEEP,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--apply': o.apply = true; break;
      case '--sweep-orphans': o.sweepOrphans = true; break;
      case '--host': o.host = args[++i]; break;
      case '--port': o.port = args[++i]; break;
      case '--password': o.password = args[++i]; break;
      case '--keep': o.keep = args[++i].split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--safe-scene': o.safeScene = args[++i]; break;
    }
  }
  return o;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Scene = { sceneName: string };
type Input = { inputName: string; inputKind: string };

async function getScenes(obs: OBSWebSocket): Promise<Scene[]> {
  const { scenes } = (await obs.call('GetSceneList')) as unknown as { scenes: Scene[] };
  return scenes;
}

/**
 * Inputs not referenced by any SURVIVING scene — i.e. inputs that are (or will
 * become) orphaned once the non-surviving scenes are removed. Scanning only the
 * surviving scenes makes this accurate both before and after scene deletion.
 * Never returns a source_switcher or a scene name.
 */
async function findOrphans(obs: OBSWebSocket, survivingSceneNames: Set<string>): Promise<Input[]> {
  const referenced = new Set<string>();
  for (const name of survivingSceneNames) {
    const { sceneItems } = (await obs.call('GetSceneItemList', { sceneName: name })) as {
      sceneItems: Array<{ sourceName: string }>;
    };
    for (const it of sceneItems) referenced.add(it.sourceName);
  }
  const { inputs } = (await obs.call('GetInputList')) as { inputs: Input[] };
  return inputs.filter(
    (i) => i.inputKind !== 'source_switcher' && !referenced.has(i.inputName) && !survivingSceneNames.has(i.inputName)
  );
}

/** Remove a set of inputs, retrying across passes to absorb OBS's async commit lag. */
async function removeInputs(obs: OBSWebSocket, names: string[], passes = 2): Promise<string[]> {
  let remaining = names;
  for (let pass = 1; pass <= passes && remaining.length; pass++) {
    for (const name of remaining) {
      try { await obs.call('RemoveInput', { inputName: name }); } catch { /* already gone / pinned */ }
    }
    await sleep(1500);
    const { inputs } = (await obs.call('GetInputList')) as { inputs: Input[] };
    const present = new Set(inputs.map((i) => i.inputName));
    remaining = remaining.filter((n) => present.has(n));
  }
  return remaining;
}

export async function run(argv: string[]): Promise<void> {
  const o = parseArgs(['', '', ...argv]);
  const url = `ws://${o.host}:${o.port}`;
  const obs = new OBSWebSocket();
  try {
    await obs.connect(url, o.password || undefined);
  } catch (err: unknown) {
    console.error(`ERROR: cannot reach OBS WebSocket at ${url}: ${err instanceof Error ? err.message : String(err)}`);
    process.exitCode = 1; return;
  }
  console.log(`Connected to ${url}`);

  // -------- sweep-orphans mode (post-restart): only remove orphaned inputs --------
  if (o.sweepOrphans) {
    const scenes = await getScenes(obs);
    const orphans = await findOrphans(obs, new Set(scenes.map((s) => s.sceneName)));
    console.log(`Orphaned inputs: ${orphans.length}`);
    orphans.forEach((i) => console.log(`  - ${i.inputName} (${i.inputKind})`));
    if (o.apply || orphans.length) {
      if (!o.apply) console.log('\n(read-only; pass --apply to remove)');
      else {
        const left = await removeInputs(obs, orphans.map((i) => i.inputName), 3);
        console.log(left.length ? `\nStill pinned (need another OBS restart): ${left.join(', ')}` : '\nAll orphans removed.');
      }
    }
    await obs.disconnect();
    return;
  }

  // -------- full cleanup (list or apply) --------
  const scenes = await getScenes(obs);
  const keep = new Set(o.keep);
  const missing = o.keep.filter((k) => !scenes.some((s) => s.sceneName === k));
  if (missing.length) console.warn(`WARNING: keep-set names not present in collection: ${missing.join(', ')}`);

  const toDelete = scenes.filter((s) => !keep.has(s.sceneName)).map((s) => s.sceneName);
  if (toDelete.length === scenes.length) {
    console.error('REFUSING: keep-set matched no scenes — would delete everything. Check --keep.');
    await obs.disconnect();
    process.exitCode = 1; return;
  }

  const survivingNames = new Set(o.keep.filter((k) => scenes.some((s) => s.sceneName === k)));
  const orphans = await findOrphans(obs, survivingNames);
  const orphanByKind: Record<string, number> = {};
  orphans.forEach((o2) => { orphanByKind[o2.inputKind] = (orphanByKind[o2.inputKind] || 0) + 1; });

  const { inputs } = (await obs.call('GetInputList')) as { inputs: Input[] };
  const switchers = inputs.filter((i) => i.inputKind === 'source_switcher');

  console.log(`\nScenes: ${scenes.length} total | keep ${scenes.length - toDelete.length} | DELETE ${toDelete.length}`);
  console.log(`  keep: ${[...keep].filter((k) => scenes.some((s) => s.sceneName === k)).join(', ')}`);
  console.log(`Orphaned inputs to remove: ${orphans.length} ${JSON.stringify(orphanByKind)}`);
  console.log(`Switchers to clear: ${switchers.length}`);

  if (!o.apply) {
    console.log('\n[DRY RUN] read-only. Re-run with --apply to perform the cleanup.');
    console.log('Scenes that would be deleted:');
    toDelete.forEach((n) => console.log(`  - ${n}`));
    await obs.disconnect();
    return;
  }

  // 1. Move program off a delete target.
  const safe = o.safeScene && keep.has(o.safeScene) ? o.safeScene
    : ['Starting', '4-Screen', '1-Screen'].find((n) => keep.has(n) && scenes.some((s) => s.sceneName === n))
    ?? [...keep].find((k) => scenes.some((s) => s.sceneName === k))!;
  await obs.call('SetCurrentProgramScene', { sceneName: safe });
  console.log(`\nProgram scene → "${safe}"`);

  // 2. Delete non-keep scenes.
  let ok = 0, fail = 0;
  for (const name of toDelete) {
    try { await obs.call('RemoveScene', { sceneName: name }); ok++; }
    catch (e) { fail++; console.log(`  FAIL scene ${name}: ${(e as Error).message}`); }
  }
  await sleep(1500);
  console.log(`Removed scenes: ${ok} (failed ${fail})`);

  // 3. Remove orphaned inputs.
  const left = await removeInputs(obs, orphans.map((i) => i.inputName), 2);

  // 4. Clear switcher sources[] (preserve path + interval), reset current_index.
  for (const sw of switchers) {
    const { inputSettings } = (await obs.call('GetInputSettings', { inputName: sw.inputName })) as {
      inputSettings: Record<string, unknown>;
    };
    await obs.call('SetInputSettings', {
      inputName: sw.inputName,
      inputSettings: { ...inputSettings, sources: [], current_index: 0 },
      overlay: true,
    });
  }
  console.log(`Cleared ${switchers.length} switcher source lists`);

  // Report.
  const finalScenes = await getScenes(obs);
  console.log(`\n=== DONE === scenes now: ${finalScenes.length}`);
  if (left.length) {
    console.log(`\n${left.length} input(s) are plugin-pinned and could not be removed:`);
    left.forEach((n) => console.log(`  - ${n}`));
    console.log('Restart OBS, then run:');
    console.log(`  npx tsx scripts/cleanObsCollection.ts --host ${o.host} --port ${o.port} --sweep-orphans --apply`);
  }
  await obs.disconnect();
}

if (import.meta.main) {
  run(process.argv.slice(2)).catch((e) => { console.error(e); process.exit(1); });
}
