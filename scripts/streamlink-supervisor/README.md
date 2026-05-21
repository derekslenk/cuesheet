# Streamlink Supervisor

Per-stream Streamlink → ffmpeg → UDP MPEG-TS supervisor for the OBS host.
Each stream is delivered to OBS via `ffmpeg_source.input = udp://127.0.0.1:<port>`,
which the webui sets when `createStreamGroupV2(..., { useFfmpegSource: true })`
is called (Phase 1.1).

## Pipeline (per stream)

```
streamlink <upstream-url> best --stdout --twitch-disable-ads --hls-live-restart
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
  `running`. Operator action is required to recover an escalated stream
  (manual reset by sending `SIGHUP` to the process is a post-event item;
  for the June 13 event, restart the supervisor service).

## Running locally (dev, macOS)

```sh
npm run supervisor
```

Env vars:

| Var | Default | Notes |
|---|---|---|
| `STREAMS_TABLE` | `streams_2025_summer_sat` | DB table to load `obs_source_name` + `url` from |
| `SUPERVISOR_HEALTH_PORT` | `8080` | HTTP `/health` listener |
| `SUPERVISOR_HEALTH_HOST` | `127.0.0.1` | Bind interface — keep loopback unless audited |
| `SUPERVISOR_BASE_PORT` | `9001` | First UDP port allocated to a stream |
| `SUPERVISOR_MAX_PORTS` | `8` | Max concurrent streams (matches 7 switchers + 1 spare) |
| `SUPERVISOR_LOG_DIR` | `./logs/streamlink-supervisor` | stderr capture root |
| `SUPERVISOR_LOG_MAX_BYTES` | `10485760` (10 MiB) | rotate-active threshold per stream |
| `SUPERVISOR_LOG_RETAIN` | `5` | Number of rotated files kept per stream |
| `STREAMLINK_PATH` | `streamlink` (PATH) | Absolute path on Windows installs |
| `FFMPEG_PATH` | `ffmpeg` (PATH) | Absolute path on Windows installs |
| `FILE_DIRECTORY` | `./files` | Where `sources.db` lives — matches webui |

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

## Windows production install (NSSM)

The supervisor is meant to run as a Windows service on the OBS host so it
starts on boot and is restarted by Windows if the Node process dies.
[NSSM](https://nssm.cc/) wraps it.

### One-time install

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
  "FFMPEG_PATH=C:\ffmpeg\bin\ffmpeg.exe"

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

- **Adding a stream:** the supervisor loads its stream list at startup
  from the `STREAMS_TABLE`. After the webui adds a stream, restart the
  supervisor service (`nssm restart StreamlinkSupervisor`) to pick it
  up. Dynamic reload (SIGHUP or a `/reload` endpoint) is post-event
  scope.

- **Removing/replacing a stream:** same — restart picks up the new list.
  The supervisor holds onto the existing pipelines for streams still
  present and drops ones no longer in the table (verify the latter
  empirically before the event).

- **Escalated stream:** if a stream goes `escalated`, the upstream Twitch
  source is most likely broken (offline, geofenced, throttled). Check
  `SUPERVISOR_LOG_DIR/<streamId>.log` for the streamlink/ffmpeg stderr
  tail. Restart the supervisor to clear escalation state.

- **Disk:** each stream uses up to
  `(SUPERVISOR_LOG_MAX_BYTES) × (SUPERVISOR_LOG_RETAIN + 1)` bytes. At
  defaults: 60 MiB per stream × 7 streams = ~420 MiB worst case.

## What this does NOT do

- **Network bind on non-loopback:** intentionally `127.0.0.1` only. UDP
  on the loopback interface has effectively zero packet loss and avoids
  any LAN exposure of raw stream content.
- **Authentication on /health:** loopback only; trust the host boundary.
- **Cross-host failover:** single supervisor per OBS host. If the
  supervisor process dies, NSSM brings it back; if the host dies, the
  fallback runbook (`docs/RUNBOOK_FALLBACK.md`) is in scope.
- **Plugin DB integration:** that's R4 (post-event) per the iter-3.4
  plan; the supervisor delivers Streamlink output to OBS via UDP, it
  does not touch `sources.db` writes (those stay with the webui).
