# Streamlink Supervisor

Per-stream Streamlink → ffmpeg → UDP MPEG-TS supervisor for the OBS host.
Each stream is delivered to OBS via `ffmpeg_source.input = udp://127.0.0.1:<port>`,
which the webui sets when `createStreamGroupV2(..., { useFfmpegSource: true })`
is called (Phase 1.1).

## Pipeline (per stream)

```
streamlink <upstream-url> best --stdout --hls-live-restart
  |
  v  (pipe)
ffmpeg -re -i pipe:0 -c copy -f mpegts udp://127.0.0.1:<port>?pkt_size=1316
  |
  v
OBS ffmpeg_source.input = udp://127.0.0.1:<port>
```

- The two child processes are coupled — if either exits, the supervisor
  kills the sibling and respawns the pair.
- **Escalation:** after 3 restarts within 30s for a single stream, the
  supervisor stops respawning that stream and flips its status to
  `escalated`. `/health` reports `degraded` whenever any stream is not
  `running`. Operator action is required to recover an escalated stream:
  `POST /streams/{id}/restart` (or the dashboard Restart button) recovers
  the stream in place without affecting other streams. Full service restart
  (`nssm restart StreamlinkSupervisor`) is last resort — it relaunches
  every stream at once.

## Running locally (dev, macOS)

```sh
npm run supervisor
```

Env vars:

| Var | Default | Notes |
|---|---|---|
| `FILE_DIRECTORY` | `./files` | Directory holding `sources.db`. **Must resolve to the same DB as the webui.** |
| `RELAY_HOST` | `127.0.0.1` | Relay bind/target host. **Must match the webui.** |
| `RELAY_BASE_PORT` | `9000` | Base of the deterministic `id → port` map. **Must match the webui.** |
| `RELAY_PORT_RANGE` | `2000` | Modulo range for that map. **Must match the webui.** |
| `STREAMS_TABLE` | season table from `lib/constants` (currently `streams_2026_summer_sat`) | DB table to load `id` + `obs_source_name` + `url` from |
| `SUPERVISOR_HEALTH_PORT` | `8080` | HTTP `/health` listener |
| `SUPERVISOR_HEALTH_HOST` | `127.0.0.1` | Bind interface — keep loopback unless audited |
| `SUPERVISOR_BASE_PORT` | `9001` | Fallback port allocator base (streams without a deterministic relay port — mainly tests) |
| `SUPERVISOR_MAX_PORTS` | `8` | Max concurrent streams (matches 7 switchers + 1 spare) |
| `SUPERVISOR_LOG_DIR` | `./logs/streamlink-supervisor` | stderr capture root |
| `SUPERVISOR_LOG_MAX_BYTES` | `10485760` (10 MiB) | rotate-active threshold per stream |
| `SUPERVISOR_LOG_RETAIN` | `5` | Number of rotated files kept per stream |
| `STREAMLINK_PATH` | `streamlink` (PATH) | Absolute path on Windows installs |
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Absolute path on Windows installs |
| `TWITCH_OAUTH_TOKEN` | *(unset)* | Twitch account `auth-token`. Passed to streamlink as `Authorization: OAuth <token>` for authenticated sessions. With a Twitch Turbo account this suppresses ad breaks (streamlink ≥7.5 auto-filters ad segments). **SECRET** — keep out of git; redacted from on-disk logs by `redact.ts`; startup logs presence only (`[supervisor] twitch token: present/absent`). |
| `STREAMLINK_QUALITY` | *(unset — defaults to `best`)* | Quality selection passed to streamlink (e.g. `720p60`, `1080p60`, `best`, or a comma-separated fallback chain like `720p60,720p,best`). Unset keeps `best`. Acts as a CPU headroom lever: 720p cuts both the pull and decode cost substantially. |
| `PREVIEW_RELAY` | *(unset — preview OFF)* | Set to `on`, `1`, `true`, or `yes` to opt in to the preview tee (fans the relay to a second UDP port for in-browser preview via the webui). Off by default — the dual-output tee was observed to periodically stall the OBS feed. |
| `SUPERVISOR_PORT_GUARD` | *(unset — guard ON)* | Set to `off` to disable the single-instance startup guard. Break-glass only — normally the guard reclaims a stale supervisor on the health port and self-registers so `cuesheet stop` reaps the process. |

Config loading depends on the entry point:

- **`npm run supervisor`** (tsx entry `index.ts`): loads `.env` and `.env.local`
  from the repo root via `@next/env` (Next.js precedence: process env >
  `.env.local` > `.env`). This is the dev and NSSM-tsx path.
- **`cuesheet sup`** (unified CLI): loads `.env.local` explicitly via
  `lib/supervisorEnv.ts` before module evaluation.
- **Compiled standalone binary** (`dist/supervisor` / `dist/supervisor.exe`):
  **process env only** — no `.env` files are loaded. Supply all vars via
  `AppEnvironmentExtra` (NSSM) or the process environment.

No DB path is baked into any binary; all paths are resolved from env vars at
runtime.

### Where the database comes from

Both the webui (writer) and the supervisor (reader) resolve the same path:

```
sources.db  =  resolve(FILE_DIRECTORY || "./files") + "/sources.db"
```

- Set `FILE_DIRECTORY` to an **absolute** path and execution location is
  irrelevant — this is the production setup (under NSSM, env comes from
  `AppEnvironmentExtra`).
- Leave it **unset** and `./files` resolves against the **current working
  directory** — i.e. wherever the process was started from (under NSSM, that's
  `AppDirectory`). Convenient in dev, fragile for a service; prefer the absolute
  path.

The supervisor opens the DB **read-write** (it now owns the durable `disabled`
write — see [Control endpoints](#control-endpoints-streams) below) but still
assumes the webui has already created `sources.db` and the season table. Point
it at a `FILE_DIRECTORY` where the webui hasn't run yet and it exits with
`SQLITE_CANTOPEN` / `no such table` rather than creating anything — **start the
webui (or seed the DB) first.**

Both processes share one DB via WAL: the supervisor and the webui open
`sources.db` in WAL mode with a 5 s `busy_timeout`, so the two processes can
read/write concurrently. WAL is a persistent property of the DB file (set once,
idempotent); the per-connection `busy_timeout` is set by every opener. **WAL
requires a local filesystem — keep `FILE_DIRECTORY` on local disk, never a
network share.** The shared bun opener (`bunDatabase.ts`) is used by BOTH
compiled entrypoints (`index.bun.ts` and `src/cli/commands/supervisor.bun.ts`)
so the read-write handle can't drift between the standalone `supervisor` binary
and the unified `cuesheet` binary.

The `RELAY_*` trio is how the webui's `ffmpeg_source.input` URL and this relay's
UDP target agree with zero coordination (`lib/relayPort`): both derive the port
from the stream's `id`. If they disagree, OBS listens on one port while the
supervisor pushes to another and you get no video — keep them identical on both
sides.

## /health

```sh
$ curl -s http://127.0.0.1:8080/health | jq
{
  "status": "ok",
  "streams": [
    {
      "streamId": "team_alpha_main",
      "upstreamUrl": "https://twitch.tv/team_alpha",
      "port": 9001,
      "obsInputUrl": "udp://127.0.0.1:9001",
      "status": "running",
      "restartCount": 0,
      "lastExitCode": null,
      "lastExitSignal": null,
      "lastExitSource": null
    }
  ]
}
```

- `status: ok` — every stream is `running`
- `status: degraded` — at least one stream is `exited` or `escalated`

## Control endpoints (`/streams`)

The supervisor is the single control backend for per-stream Start / Stop /
Restart. All routes are loopback-only (same host/port as `/health`), POST a
JSON body, and key on `obs_source_name` (the `streamId`).

| Route | Method | Effect |
|---|---|---|
| `GET /streams` | GET | DB-backed list of **all** streams (incl. stopped) merged with live supervised status. Backs the dashboard so a stopped row can still host a Start button. |
| `POST /streams/{obs_source_name}/start` | POST | Flips `disabled = 0` in the DB, then starts the pipeline in place. `200 {status:'ok'}`, `404` for an unknown id, `500` on a DB error. |
| `POST /streams/{obs_source_name}/stop` | POST | Flips `disabled = 1` in the DB, then stops the pipeline. Same response codes. |
| `POST /streams/{obs_source_name}/restart` | POST | In-place restart of a running/escalated stream (no DB change). `404` for an unknown id. |

- **Durability:** Start/Stop write the `disabled` flag **before** touching the
  pipeline, so the flag is authoritative even if the start/stop half fails. A
  `disabled = 1` row is excluded from the supervised set on boot **and** on
  reload, which is what makes a Stop survive a supervisor restart.
- **`/reload` is the reconcile authority:** `POST /reload` re-reads the table
  and converges the running set on the `disabled` filter (starts newly-enabled
  rows, stops newly-disabled ones). Start/Stop are the fast direct path;
  `/reload` is the catch-up that absorbs any break-glass DB write the webui made
  while the supervisor was down.

## Dashboard (Phase 3.1)

Point a browser at `http://127.0.0.1:8080/` (same host/port as `/health`,
just the root path) to see a single self-contained page that polls
`/health` once per second and renders a green/red row per stream. No build
step, no external dependencies — the HTML is served from
`scripts/streamlink-supervisor/dashboard.html`. `GET /dashboard` is an alias.

The dashboard:

- Shows overall status (`ok` / `degraded` / `unreachable`).
- Lists each stream with status, restart count, and the UDP URL OBS reads.
- Flags restart counts ≥ 3 and `escalated` rows in red.
- Continues retrying on its own if the supervisor goes down or the host
  becomes unreachable, so leaving it open at the operator station is safe.

If `dashboard.html` is missing on the host (renamed or removed) the
supervisor logs a warning and serves `404` at `/`; `/health` JSON is
unaffected.

## Single-executable build (Bun)

The supervisor can be compiled into ONE self-contained binary — no Node, no
`tsx`, no `node_modules` on the OBS host. Only `streamlink` and `ffmpeg` stay
external (they are spawned, not bundled).

```bash
npm run supervisor:build       # host-native binary  -> dist/supervisor
npm run supervisor:build:win   # Windows x64 binary  -> dist/supervisor.exe
```

This builds `index.bun.ts` (a Bun-native twin of `index.ts`) with
[`bun build --compile`](https://bun.sh/docs/bundler/executables). Two things
make a clean single binary possible:

- **DB:** `index.bun.ts` opens `sources.db` through Bun's built-in `bun:sqlite`
  (read-write, WAL + `busy_timeout`, via the shared `bunDatabase.ts` opener)
  instead of the `sqlite3` native addon, so there is no `.node` to embed.
  `lib/database` is untouched — the webui still uses `sqlite3` (also WAL).
- **Dashboard:** `dashboard.html` is embedded at compile time
  (`import ... with { type: 'text' }`), so `/` works from inside the packed
  binary with no file on disk.

The binary honors the same env vars as the `tsx` entry point. `dist/` is
git-ignored; build on (or for) the target OS — the Windows `.exe` is produced
by the `--target=bun-windows-x64` cross-compile above and can be built from
macOS.

## Windows production install (NSSM)

The supervisor is meant to run as a Windows service on the OBS host so it
starts on boot and is restarted by Windows if the process dies.
[NSSM](https://nssm.cc/) wraps it.

The simplest install points NSSM straight at the compiled `.exe` (no Node or
`tsx` on the host):

```powershell
nssm install StreamlinkSupervisor C:\OBS\webui\dist\supervisor.exe
nssm set StreamlinkSupervisor AppDirectory C:\OBS\webui
# ...then the same AppStdout / AppEnvironmentExtra / restart-policy lines as below.
```

### One-time install (Node + tsx, no compiled binary)

Assuming `tsx`, `streamlink`, and `ffmpeg` are on PATH (or the env vars
above are set):

```powershell
# Pick a directory to install from; typically the webui checkout itself
$repoRoot = "C:\OBS\webui"

# Path to the Node binary (NSSM needs the exact exe)
$node = (Get-Command node).Source
$tsx  = Join-Path $repoRoot "node_modules\.bin\tsx.cmd"
$script = Join-Path $repoRoot "scripts\streamlink-supervisor\index.ts"

nssm install StreamlinkSupervisor $node $tsx $script
nssm set StreamlinkSupervisor AppDirectory $repoRoot
nssm set StreamlinkSupervisor AppStdout C:\OBS\logs\supervisor-stdout.log
nssm set StreamlinkSupervisor AppStderr C:\OBS\logs\supervisor-stderr.log
nssm set StreamlinkSupervisor AppRotateFiles 1
nssm set StreamlinkSupervisor AppRotateOnline 1
nssm set StreamlinkSupervisor AppRotateBytes 10485760

# Env vars (repeat `set ... AppEnvironmentExtra` for each)
nssm set StreamlinkSupervisor AppEnvironmentExtra `
  "FILE_DIRECTORY=C:\OBS\source-switching" `
  "SUPERVISOR_LOG_DIR=C:\OBS\logs\streamlink" `
  "STREAMLINK_PATH=C:\Program Files\Streamlink\bin\streamlink.exe" `
  "FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe" `
  # SECRET — required for ad suppression in production; the compiled binary
  # loads no .env files so this must be set here. Retrieve from the ops vault.
  "TWITCH_OAUTH_TOKEN=<token from the ops vault>"

# Restart policy: NSSM auto-restarts on exit. Cap escalation so a sick
# supervisor doesn't burn CPU restarting forever.
nssm set StreamlinkSupervisor AppRestartDelay 1000          # 1s
nssm set StreamlinkSupervisor AppThrottle 5000              # don't count quick restarts inside this window
nssm set StreamlinkSupervisor AppExit Default Restart
nssm set StreamlinkSupervisor AppStopMethodSkip 6           # send SIGINT-equivalent so our shutdown handlers run

nssm start StreamlinkSupervisor
```

### Update procedure

```powershell
# Pull new code first, then:
nssm restart StreamlinkSupervisor
```

### Uninstall

```powershell
nssm stop StreamlinkSupervisor
nssm remove StreamlinkSupervisor confirm
```

## Operating notes

- **Adding a stream:** after the webui adds a stream, send `POST /reload`
  (or use the dashboard) to pick it up without restarting the supervisor.
  The webui pings `/reload` automatically after `addStream`. If the
  supervisor is down at that moment, restart it to resync; it reads the
  current DB on startup.

- **Removing/replacing a stream:** same — `POST /reload` converges the
  running set on the updated DB. The supervisor keeps existing pipelines
  for streams still present and stops ones no longer in the table.

- **Escalated stream:** if a stream goes `escalated`, the upstream Twitch
  source is most likely broken (offline, geofenced, throttled). Check
  `SUPERVISOR_LOG_DIR/<streamId>.log` for the streamlink/ffmpeg stderr
  tail. Recover in place: `POST /streams/{id}/restart` or the dashboard
  Restart button (clears the restart tracker and relaunches the pipeline
  without touching other streams). Full service restart
  (`nssm restart StreamlinkSupervisor`) is last resort — avoid mid-event.

- **Disk:** each stream uses up to
  `(SUPERVISOR_LOG_MAX_BYTES) × (SUPERVISOR_LOG_RETAIN + 1)` bytes. At
  defaults: 60 MiB per stream × 7 streams = ~420 MiB worst case.

## What this does NOT do

- **Network bind on non-loopback:** intentionally `127.0.0.1` only. UDP
  on the loopback interface has effectively zero packet loss and avoids
  any LAN exposure of raw stream content.
- **Authentication on /health or /streams:** loopback only; trust the host
  boundary. The control endpoints mutate the DB and have no auth — they rely on
  the `127.0.0.1` bind, so do not expose the health port off-host.
- **Cross-host failover:** single supervisor per OBS host. If the
  supervisor process dies, NSSM brings it back; if the host dies, the
  fallback runbook (`docs/RUNBOOK_FALLBACK.md`) is in scope.
- **Stream CRUD:** the supervisor writes exactly one column — the `disabled`
  flag, via the Start/Stop control endpoints. Adding, editing, or deleting
  stream rows (and all OBS source management) stays with the webui; the
  supervisor delivers Streamlink output to OBS via UDP.
