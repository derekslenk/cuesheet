/**
 * CueSheet 40-stream LOAD + SWITCHING test harness.
 *
 * Goal: validate (a) OBS decoding ~40 concurrent mpegts Media Sources on the
 * event host and (b) the source-switcher picking the *right* feed — without
 * sourcing 40 real Twitch streams. Each stream shows a big unmistakable
 * "STREAM NNNN" label + a running clip clock, so switching is visually
 * unambiguous and the feeds are fully reproducible.
 *
 * Fidelity:
 *  - Streams/sources/switcher entries are created through the real webui APIs
 *    (/api/addStream, /api/teams), so the exact production wiring is exercised.
 *  - Generators stream a PRE-ENCODED clip with `-c copy` (no re-encode) — the
 *    same cheap cost as the real streamlink→ffmpeg relays, so the OBS-decode
 *    load being measured isn't drowned out by 40 live H.264 encodes.
 *  - Ports come from the same deterministic lib/relayPort the webui/supervisor
 *    use, so OBS reads exactly where the generators write.
 *
 * IMPORTANT: stop the real streamlink supervisor before `start` — it would
 * fight the generators for the same relay UDP ports.
 *
 * Usage (run on the Windows host, webui must be running):
 *   npm run loadtest -- seed 40        # create 40 LOADTEST streams (OBS sources + switcher)
 *   npm run loadtest -- prep 40        # pre-encode the 40 numbered clips (one-time, cached)
 *   npm run loadtest -- start          # stream all LOADTEST feeds (foreground; Ctrl+C stops)
 *   npm run loadtest -- cycle 1500     # auto-switch active source every 1500ms (switching stress)
 *   npm run loadtest -- status         # show streams / generators / supervisor state
 *   npm run loadtest -- stop           # kill generators (best-effort)
 *   npm run loadtest -- teardown       # stop generators + delete all LOADTEST streams + team
 *
 * Env overrides: LOADTEST_WEBUI (http://127.0.0.1:3000), FFMPEG_PATH,
 *   LOADTEST_FONT, LOADTEST_W/H/FPS, LOADTEST_CLIP_SECONDS.
 */
import { spawn, spawnSync, ChildProcess } from 'child_process';
import { existsSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { relayPort } from '../../lib/relayPort';
import { SOURCE_SWITCHER_NAMES } from '../../lib/constants';

const WEBUI = process.env.LOADTEST_WEBUI ?? 'http://127.0.0.1:3000';
const FFMPEG = process.env.FFMPEG_PATH ?? 'ffmpeg';
const FONT = process.env.LOADTEST_FONT ?? 'C\\:/Windows/Fonts/arial.ttf';
const TEAM = 'LOADTEST';
const NAME_RE = /^STREAM \d{4}$/;
const CLIPS = join(tmpdir(), 'cuesheet-loadtest');
const W = parseInt(process.env.LOADTEST_W ?? '1280', 10);
const H = parseInt(process.env.LOADTEST_H ?? '720', 10);
const FPS = parseInt(process.env.LOADTEST_FPS ?? '30', 10);
const CLIP_SECONDS = parseInt(process.env.LOADTEST_CLIP_SECONDS ?? '30', 10);

interface ApiTeam { team_id: number; team_name: string }
interface ApiStream { id: number; name: string }

const labelFor = (n: number): string => `STREAM ${String(n).padStart(4, '0')}`;
const clipFor = (label: string): string => join(CLIPS, label.replace(/\s+/g, '_') + '.ts');
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

async function api<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${WEBUI}${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

// createSuccessResponse wraps payloads as { data }; addStream returns raw.
function unwrap<T>(r: { data?: T } | T): T {
  return (r as { data?: T }).data ?? (r as T);
}

async function getTeamId(): Promise<number | null> {
  const teams = unwrap<ApiTeam[]>(await api('GET', '/api/teams'));
  return teams.find((t) => t.team_name === TEAM)?.team_id ?? null;
}

async function ensureTeam(): Promise<number> {
  const existing = await getTeamId();
  if (existing !== null) return existing;
  const created = unwrap<ApiTeam>(
    await api('POST', '/api/teams', { team_name: TEAM, create_obs_group: true })
  );
  return created.team_id;
}

async function loadTestStreams(): Promise<ApiStream[]> {
  const streams = unwrap<ApiStream[]>(await api('GET', '/api/streams'));
  return streams.filter((s) => NAME_RE.test(s.name)).sort((a, b) => a.name.localeCompare(b.name));
}

async function supervisorUp(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:8080/health', { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch { return false; }
}

function encodeClip(label: string): string {
  mkdirSync(CLIPS, { recursive: true });
  const out = clipFor(label);
  if (existsSync(out)) return out;
  const big = Math.round(H / 5);
  const small = Math.round(H / 12);
  const vf =
    `drawtext=fontfile=${FONT}:text='${label}':fontcolor=white:fontsize=${big}:` +
    `box=1:boxcolor=black@0.6:x=(w-text_w)/2:y=(h-text_h)/2-40,` +
    `drawtext=fontfile=${FONT}:text='%{pts\\:hms}':fontcolor=yellow:fontsize=${small}:` +
    `x=(w-text_w)/2:y=h-${small * 2}`;
  const args = [
    '-y',
    '-f', 'lavfi', '-i', `testsrc2=size=${W}x${H}:rate=${FPS}`,
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-t', String(CLIP_SECONDS),
    '-vf', vf,
    '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-g', String(FPS * 2),
    '-c:a', 'aac', '-b:a', '64k', '-shortest',
    '-f', 'mpegts', out,
  ];
  const r = spawnSync(FFMPEG, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`ffmpeg failed to encode clip for ${label} (exit ${r.status})`);
  return out;
}

async function cmdSeed(n: number): Promise<void> {
  const teamId = await ensureTeam();
  const have = new Set((await loadTestStreams()).map((s) => s.name));
  let created = 0;
  for (let i = 1; i <= n; i++) {
    const name = labelFor(i);
    if (have.has(name)) continue;
    await api('POST', '/api/addStream', {
      name,
      url: `https://www.twitch.tv/loadtest_${String(i).padStart(4, '0')}`,
      team_id: teamId,
      lockSources: true,
    });
    created++;
    process.stdout.write(`  seeded ${name}\r`);
  }
  console.log(`\nseeded ${created} new stream(s); ${TEAM} now has ${(await loadTestStreams()).length}`);
}

function cmdPrep(n: number): void {
  for (let i = 1; i <= n; i++) {
    const label = labelFor(i);
    if (existsSync(clipFor(label))) { console.log(`  cached ${label}`); continue; }
    console.log(`  encoding ${label} ...`);
    encodeClip(label);
  }
  console.log(`clips ready in ${CLIPS}`);
}

async function cmdStart(): Promise<void> {
  if (await supervisorUp()) {
    console.warn('WARNING: the streamlink supervisor is UP on :8080 — stop it first, it will fight the generators for the relay ports.');
  }
  const streams = await loadTestStreams();
  if (streams.length === 0) { console.log('no LOADTEST streams — run: npm run loadtest -- seed <N>'); return; }
  mkdirSync(CLIPS, { recursive: true });
  const procs: ChildProcess[] = [];
  for (const s of streams) {
    const clip = existsSync(clipFor(s.name)) ? clipFor(s.name) : encodeClip(s.name);
    const port = relayPort(s.id);
    const p = spawn(
      FFMPEG,
      ['-re', '-stream_loop', '-1', '-i', clip, '-c', 'copy', '-f', 'mpegts', `udp://127.0.0.1:${port}?pkt_size=1316`],
      { stdio: 'ignore' }
    );
    procs.push(p);
    console.log(`  ${s.name} (id ${s.id}) -> udp://127.0.0.1:${port}  pid ${p.pid}`);
  }
  console.log(`\n${procs.length} generators running. Drive switching in the webui and watch the numbers. Ctrl+C to stop all.`);
  const stop = (): void => {
    console.log('\nstopping generators...');
    for (const p of procs) { try { p.kill('SIGTERM'); } catch { /* gone */ } }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise<void>(() => { /* run until Ctrl+C */ });
}

async function cmdCycle(intervalMs: number): Promise<void> {
  const streams = await loadTestStreams();
  if (streams.length === 0) { console.log('no LOADTEST streams'); return; }
  const screens = SOURCE_SWITCHER_NAMES;
  console.log(`cycling ${streams.length} stream(s) across ${screens.length} screen(s) every ${intervalMs}ms. Ctrl+C to stop.`);
  let stopped = false;
  process.on('SIGINT', () => { stopped = true; });
  for (let i = 0; !stopped; i++) {
    const s = streams[i % streams.length];
    for (const screen of screens) {
      try { await api('POST', '/api/setActive', { screen, id: s.id }); }
      catch (e) { console.error(`  setActive(${screen}) failed:`, (e as Error).message); }
    }
    process.stdout.write(`  active: ${s.name} (id ${s.id})            \r`);
    await sleep(intervalMs);
  }
  console.log('\ncycle stopped');
}

function cmdStop(): void {
  // Best-effort: kill ffmpeg processes whose command line references our clip dir.
  const ps =
    "Get-CimInstance Win32_Process -Filter \"Name='ffmpeg.exe'\" | " +
    "Where-Object { $_.CommandLine -like '*cuesheet-loadtest*' } | " +
    'ForEach-Object { Stop-Process -Id $_.ProcessId -Force }';
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
  console.log(r.status === 0 ? 'generators stopped' : 'stop attempted (non-Windows or none running)');
}

async function cmdTeardown(): Promise<void> {
  cmdStop();
  const streams = await loadTestStreams();
  for (const s of streams) {
    try { await api('DELETE', `/api/streams/${s.id}`); console.log(`  deleted ${s.name}`); }
    catch (e) { console.error(`  delete ${s.name} failed:`, (e as Error).message); }
  }
  const teamId = await getTeamId();
  if (teamId !== null) {
    try { await api('DELETE', `/api/teams/${teamId}`); console.log(`  deleted team ${TEAM}`); }
    catch (e) { console.error(`  delete team failed (delete remaining streams first?):`, (e as Error).message); }
  }
  console.log('teardown complete');
}

async function cmdStatus(): Promise<void> {
  const streams = await loadTestStreams();
  console.log(`LOADTEST streams: ${streams.length}`);
  console.log(`supervisor (:8080): ${(await supervisorUp()) ? 'UP (stop before start!)' : 'down'}`);
  const r = spawnSync('powershell', ['-NoProfile', '-Command',
    "(Get-CimInstance Win32_Process -Filter \"Name='ffmpeg.exe'\" | Where-Object { $_.CommandLine -like '*cuesheet-loadtest*' }).Count"],
    { encoding: 'utf8' });
  console.log(`running generators: ${(r.stdout ?? '?').trim()}`);
  console.log(`clip cache: ${CLIPS}`);
}

function help(): void {
  console.log(`CueSheet load-test harness — commands:
  seed <N>      create N LOADTEST streams (real OBS sources + switcher entries)
  prep <N>      pre-encode N numbered clips (cached in ${CLIPS})
  start         stream all LOADTEST feeds with -c copy (foreground; Ctrl+C stops)
  cycle <ms>    auto-switch the active source every <ms> (switching stress)
  status        show streams / generators / supervisor
  stop          kill generators (best-effort)
  teardown      stop + delete all LOADTEST streams and the team
Stop the streamlink supervisor before 'start' (port conflict).`);
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  switch (cmd) {
    case 'seed': await cmdSeed(parseInt(arg ?? '40', 10)); break;
    case 'prep': cmdPrep(parseInt(arg ?? '40', 10)); break;
    case 'start': await cmdStart(); break;
    case 'cycle': await cmdCycle(parseInt(arg ?? '1500', 10)); break;
    case 'stop': cmdStop(); break;
    case 'teardown': await cmdTeardown(); break;
    case 'status': await cmdStatus(); break;
    default: help();
  }
}

main().catch((err: unknown) => {
  console.error('loadtest error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
