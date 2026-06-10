<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# streamlink-supervisor

## Purpose

A long-running supervisor that ingests Twitch (and similar) streams into the OBS host for CueSheet's Stream-a-Thon. It opens the webui SQLite (`sources.db`) **read-write** (WAL + `busy_timeout`, shared with the webui), reads the active stream list, spawns one `streamlink → ffmpeg` pair per stream that pushes MPEG-TS to a per-stream UDP port on `127.0.0.1`, and respawns any pair that exits. A `RestartTracker` escalates a stream out of the auto-respawn loop after 3 restarts within 30 s (crash-loop guard). It is also the single control backend for per-stream Start/Stop/Restart: a `/health` HTTP endpoint aggregates per-stream status, `GET /streams` returns a DB-backed list, `POST /streams/{id}/{start,stop,restart}` mutate a stream (Start/Stop own the durable `disabled` flag), and it serves a `dashboard.html`. It is designed to run as a Windows service via NSSM on the OBS host (see `README.md`).

## Key Files

| File | Description |
|---|---|
| `index.ts` | Entry point (npm `supervisor`). Loads `dashboardHtml`, reads env config (`SUPERVISOR_BASE_PORT`=9001, `SUPERVISOR_MAX_PORTS`=8, `SUPERVISOR_HEALTH_PORT`=8080, `SUPERVISOR_HEALTH_HOST`=127.0.0.1, `SUPERVISOR_LOG_DIR`, `SUPERVISOR_LOG_MAX_BYTES`, `SUPERVISOR_LOG_RETAIN`, `STREAMLINK_PATH`, `FFMPEG_PATH`, `STREAMS_TABLE`), opens the DB, and calls `startRuntime`. |
| `runtime.ts` | `startRuntime()` wires everything together: loads stream specs, builds per-stream `FileLogger`s, constructs the `Supervisor` (with `PortAllocator` + `RestartTracker`), and defines the control closures over the RW db — `onStart`/`onStop` (write the `disabled` flag, then start/stop the pipeline; return false for an unknown id) and `listAll` (merge DB rows with live status into `DashboardStream[]`). Starts the health server (passing those closures) and returns them plus a `shutdown()`. |
| `supervisor.ts` | `Supervisor` class — owns the set of supervised streams, allocates ports, builds `StreamPipeline`s, handles exits, applies restart-vs-escalate decisions, and exposes stream state (`running` / `escalated`). `restart(streamId)` does an operator-triggered in-place restart (reuses spec/port, clears the tracker) and recovers `escalated` streams. |
| `streamPipeline.ts` | `StreamPipeline` — builds and spawns the streamlink + ffmpeg child pair (piping streamlink stdout → ffmpeg stdin), tracks `pending`/`running`/`exited` status, surfaces `onExit`/`onStderr`, computes the per-stream `obsInputUrl`. Uses an injectable `SpawnFn` for testability. |
| `commands.ts` | Pure command builders: `buildStreamlinkCmd` (`--stdout --hls-live-restart <url> <quality>`; `--twitch-disable-ads` intentionally omitted — streamlink ≥7.5 auto-filters ad segments, with `TWITCH_OAUTH_TOKEN` as the ad mitigation) and `buildFfmpegRelayCmd` (validates port ∈ [1,65535], emits the UDP relay args + `obsInputUrl`). |
| `portAllocator.ts` | `PortAllocator` — hands out sequential ports from `basePort` up to `max`, tracks in-use set + allocation order, releases on free, throws `PortExhaustedError` when full. |
| `restartTracker.ts` | `RestartTracker` — sliding-window restart counter (default 30 000 ms / max 3). `record`, `shouldEscalate` (≥ max in window), `forget`; prunes timestamps outside the window. |
| `healthServer.ts` | HTTP server: `handleHealthRequest` serves `/` + `/dashboard` (HTML, GET-only), `/health` (JSON snapshot from a `HealthSnapshotProvider`), `POST /reload` (DB reconcile via `onReload`), `POST /streams/{streamId}/restart` (single-stream in-place restart via `onRestart`), `POST /streams/{streamId}/{start,stop}` (durable enable/disable via `onStart`/`onStop`), and `GET /streams` (DB-backed `DashboardStream[]` list via `listAll`). Routes return 200/404/405/500/501. `startHealthServer` binds it. |
| `streamSpecsLoader.ts` | DB row access. `MinimalDb` now has `run(sql, ...params)` (RW) alongside `all`. `loadStreamSpecs` — `SELECT id, obs_source_name, url, disabled FROM <table>` (table name validated against `assertSafeTableName`/`SAFE_TABLE_NAME`; falls back to the legacy column set when `disabled` is absent), skips empty/invalid rows **and `disabled=1` rows** (operator-stopped), maps via `rowToSpec` to `{ streamId, upstreamUrl, port }`. `loadStreamSpec(opts, streamId)` loads one stream by `obs_source_name` regardless of `disabled` (so Start can re-enable it); `loadStreamRows` returns the raw rows for `listAll`. The `disabled` filter is what makes a Stop durable across `/reload` and supervisor restart. |
| `bunDatabase.ts` | **Bun-only** (imports `bun:sqlite`; excluded from tsc + Jest). `openBunDatabase(fileDirectory)` returns one shared read-write `MinimalDb` (WAL + `busy_timeout` + `wal_autocheckpoint`) used by BOTH compiled entrypoints (`index.bun.ts`, `src/cli/commands/supervisor.bun.ts`) so the shipped `supervisor` and `cuesheet` binaries can't drift to read-only. |
| `fileLogger.ts` | `FileLogger` — size-based rotating per-stream log writer (`maxBytes` + `retain` files); creates the dir, rotates on overflow. |
| `supervisorGuard.ts` | Single-instance guard: probes `SUPERVISOR_HEALTH_PORT`, reads the incumbent's PID from `/health`, verifies identity via OS creation time (`isSafeToKill` from `src/cli/lib/procState`), kills a stale incumbent and proceeds, or exits if a healthy peer is already running. Set `SUPERVISOR_PORT_GUARD=off` to skip entirely. |
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
- The DB handle is now **read-write** (WAL + `busy_timeout`) and the supervisor owns the durable `disabled` write. Start/Stop write the flag **before** start/stop the pipeline so the flag stays authoritative on a partial failure; `disabled=1` excludes a row from the supervised set on boot AND on `/reload`. `/reload` remains the reconcile authority that converges the running set on the `disabled` filter (and absorbs any break-glass write the webui made while the supervisor was down). Keep that ordering and the read-write WAL handle when editing the bun entrypoints — both must go through `bunDatabase.ts`.

### Testing Requirements

- Each module has a matching `*.test.ts` in `__tests__/`. Run via repo-root `npm test`.
- Tests inject fake `SpawnFn`/clock/DB — do not introduce real child-process or filesystem coupling into the testable modules.

### Common Patterns

- Dependency injection (spawn fn, clock, enqueue, snapshot provider) for deterministic tests.
- Pure command builders separated from process spawning.
- `obsInputUrl` is the contract handed to the scene converter and the `/health` consumers.

## Dependencies

### Internal

- `lib/database` (`getDatabase`, read-write WAL handle), `lib/constants` (`TABLE_NAMES`) — used by `index.ts`; `lib/relayPort` (`relayPort`) for the deterministic `id → port` map used by `rowToSpec`/`listAll`. The bun entrypoints open the DB via `bunDatabase.ts` instead of `lib/database`.
- `src/cli/lib/procState` + `src/cli/lib/types` — deliberate cross-package reuse: `supervisorGuard.ts` imports `isSafeToKill`, `processStartTimeMs`, and the `ProcessRecord` type directly from the CLI's process-identity primitives rather than duplicating the creation-time logic. Flagged for extraction to a shared package post-event.

### External

- Node builtins: `child_process`, `http`, `fs`, `path`, `url`
- Host binaries: `streamlink`, `ffmpeg` (paths overridable via `STREAMLINK_PATH` / `FFMPEG_PATH`)
- NSSM (Windows service wrapper, deployment-time)

<!-- MANUAL: notes below preserved on regeneration -->
