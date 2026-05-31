<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# streamlink-supervisor

## Purpose

A long-running supervisor that ingests Twitch (and similar) streams into the OBS host for CueSheet's Stream-a-Thon. It reads the active stream list from the webui SQLite (`sources.db`), spawns one `streamlink → ffmpeg` pair per stream that pushes MPEG-TS to a per-stream UDP port on `127.0.0.1`, and respawns any pair that exits. A `RestartTracker` escalates a stream out of the auto-respawn loop after 3 restarts within 30 s (crash-loop guard). A `/health` HTTP endpoint aggregates per-stream status, restart counts, and OBS input URLs, and serves a `dashboard.html`. It is designed to run as a Windows service via NSSM on the OBS host (see `README.md`).

## Key Files

| File | Description |
|---|---|
| `index.ts` | Entry point (npm `supervisor`). Loads `dashboardHtml`, reads env config (`SUPERVISOR_BASE_PORT`=9001, `SUPERVISOR_MAX_PORTS`=8, `SUPERVISOR_HEALTH_PORT`=8080, `SUPERVISOR_HEALTH_HOST`=127.0.0.1, `SUPERVISOR_LOG_DIR`, `SUPERVISOR_LOG_MAX_BYTES`, `SUPERVISOR_LOG_RETAIN`, `STREAMLINK_PATH`, `FFMPEG_PATH`, `STREAMS_TABLE`), opens the DB, and calls `startRuntime`. |
| `runtime.ts` | `startRuntime()` wires everything together: loads stream specs, builds per-stream `FileLogger`s, constructs the `Supervisor` (with `PortAllocator` + `RestartTracker`), starts the health server, and returns a `shutdown()`. |
| `supervisor.ts` | `Supervisor` class — owns the set of supervised streams, allocates ports, builds `StreamPipeline`s, handles exits, applies restart-vs-escalate decisions, and exposes stream state (`running` / `escalated`). |
| `streamPipeline.ts` | `StreamPipeline` — builds and spawns the streamlink + ffmpeg child pair (piping streamlink stdout → ffmpeg stdin), tracks `pending`/`running`/`exited` status, surfaces `onExit`/`onStderr`, computes the per-stream `obsInputUrl`. Uses an injectable `SpawnFn` for testability. |
| `commands.ts` | Pure command builders: `buildStreamlinkCmd` (`--stdout --twitch-disable-ads --hls-live-restart <url> <quality>`) and `buildFfmpegRelayCmd` (validates port ∈ [1,65535], emits the UDP relay args + `obsInputUrl`). |
| `portAllocator.ts` | `PortAllocator` — hands out sequential ports from `basePort` up to `max`, tracks in-use set + allocation order, releases on free, throws `PortExhaustedError` when full. |
| `restartTracker.ts` | `RestartTracker` — sliding-window restart counter (default 30 000 ms / max 3). `record`, `shouldEscalate` (≥ max in window), `forget`; prunes timestamps outside the window. |
| `healthServer.ts` | HTTP server: `handleHealthRequest` serves `/` + `/dashboard` (HTML, GET-only) and `/health` (JSON snapshot from a `HealthSnapshotProvider`); `startHealthServer` binds it. |
| `streamSpecsLoader.ts` | `loadStreamSpecs` — `SELECT obs_source_name, url FROM <table>` (table name validated against `SAFE_TABLE_NAME`), filters empty rows, maps to `{ streamId, upstreamUrl }`. |
| `fileLogger.ts` | `FileLogger` — size-based rotating per-stream log writer (`maxBytes` + `retain` files); creates the dir, rotates on overflow. |
| `dashboard.html` | Static dashboard served at `/` that polls `/health`. |
| `README.md` | Install/run procedure (NSSM Windows service) and config reference. |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `__tests__/` | Jest unit tests for every module (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- The entry (`index.ts`) only does I/O and config; all decision logic lives in the injectable, unit-tested modules. Keep it that way — pass `spawn`, `now`, `enqueue` etc. as dependencies rather than calling globals directly.
- `streamId` is the OBS source name (`obs_source_name`); it keys ports, loggers, and restart history.
- Escalation is terminal for the auto-loop: an escalated stream is not respawned until the supervisor restarts. Don't silently re-arm it.

### Testing Requirements

- Each module has a matching `*.test.ts` in `__tests__/`. Run via repo-root `npm test`.
- Tests inject fake `SpawnFn`/clock/DB — do not introduce real child-process or filesystem coupling into the testable modules.

### Common Patterns

- Dependency injection (spawn fn, clock, enqueue, snapshot provider) for deterministic tests.
- Pure command builders separated from process spawning.
- `obsInputUrl` is the contract handed to the scene converter and the `/health` consumers.

## Dependencies

### Internal

- `lib/database` (`getDatabase`), `lib/constants` (`TABLE_NAMES`) — used by `index.ts`

### External

- Node builtins: `child_process`, `http`, `fs`, `path`, `url`
- Host binaries: `streamlink`, `ffmpeg` (paths overridable via `STREAMLINK_PATH` / `FFMPEG_PATH`)
- NSSM (Windows service wrapper, deployment-time)

<!-- MANUAL: notes below preserved on regeneration -->
