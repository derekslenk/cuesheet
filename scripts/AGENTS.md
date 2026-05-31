<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# scripts

## Purpose

Operational tooling for CueSheet (the Next.js webui that drives OBS Studio for live-stream production) and its OBS Stream-a-Thon event. This directory mixes one-off DB migration/utility scripts (table creation, column adds, schema verification, SQLite-open audits, path remaps) with five larger phased modules (each in its own subdirectory with a thin top-level entry wrapper): a Streamlink supervisor, a browser-source→media-source scene converter, a setActive load driver, an atomic-write soak harness, and an OBS process-metrics scraper. Several scripts probe and measure the external **obs-source-switcher** OBS plugin (github.com/exeldro/obs-source-switcher) that CueSheet writes `${screen}.txt` files for — they are diagnostics for that plugin, not part of it.

## Key Files

### Module entry wrappers (each delegates to a same-named subdir)

| File | Description |
|---|---|
| `streamlink-supervisor/index.ts` | Entry for the Streamlink supervisor (npm `supervisor`). Reads the active stream list from `sources.db`, spawns one streamlink→ffmpeg pair per stream pushing MPEG-TS to a per-stream UDP port, exposes `/health`, respawns with RestartTracker escalation. Configured via `SUPERVISOR_*`, `STREAMLINK_PATH`, `FFMPEG_PATH`, `STREAMS_TABLE` env vars. Built to run under NSSM on the Windows OBS host. |
| `convertBrowserToMedia.ts` | CLI entry (npm `convert:browser-to-media`) that rewrites `browser_source` inputs in an OBS scene-collection JSON into `ffmpeg_source` inputs pointing at the supervisor's UDP endpoints. Enforces a safety contract (see subdir). |
| `loadDriver.ts` | CLI entry (npm `load:setactive`) that fires N `setActive` HTTP calls across a time window and reports p50/p95/p99 + a Phase 1.4 SLO verdict. |
| `atomicWriteSoak.ts` | CLI entry (npm `soak:atomic-write`) for the atomic-write soak. Compares `write` vs `rename` strategies under concurrent read/write, looking for torn reads. |
| `atomicWriteSoak.mjs` | ESM mirror of `atomicWriteSoak.ts` (npm `soak:atomic-write:mjs`) for hosts without `tsx` — used for the Phase 2.2 F1 Windows soak. Keep behavior identical to the `.ts` entry. |

### Database / schema scripts

| File | Description |
|---|---|
| `createSatSummer2025Tables.ts` | Creates the SaT Summer event tables in `sources.db` (npm `create-sat-summer-2025-tables`). |
| `addGroupUuidColumn.ts` | Adds the `group_uuid` column to the streams table (npm `add-group-uuid-column`). |
| `addGroupNameToTeams.ts` | Idempotently `ALTER TABLE`s the teams table to add a `group_name TEXT` column. |
| `verifyTables.ts` | Opens `sources.db` and reports table contents for manual verification. |
| `auditSqliteOpens.ts` | Fails (exit 1) if any `sqlite.open()` call site appears outside `auditSqliteOpens.allowlist.txt` (npm `audit:sqlite-opens`). |
| `auditSqliteOpens.allowlist.txt` | Allowlist of sanctioned `sqlite.open()` call sites consumed by the audit script. |

### OBS / switcher diagnostics & remaps

| File | Description |
|---|---|
| `verifySwitcherCoverage.ts` | S4' kill switch (npm `verify:switcher-coverage`): asserts every DB stream's setActive group-name exists as a `value` in each `source_switcher` source in the scene-collection JSON. |
| `remapMacObsSwitcherPaths.ts` | Remaps the 7 obs-source-switcher inputs in Mac OBS from Windows `C:/OBS/...` paths to Mac-side paths via OBS WebSocket (npm `remap:mac-obs-switcher-paths`). |
| `measureSwitcherLatency.ts` | Measures file→plugin→OBS scene-change latency, establishing the Phase 4.2 p95 baseline (npm `measure:switcher-latency`). |
| `measureSwitcherLatencyV2.mjs` | Standalone ESM latency runner using screenshot-hash detection (the plugin emits no observable WebSocket event). Copied to the OBS host with its sidecar package.json. |
| `measureSwitcherLatencyV2.package.json` | Sidecar manifest for the V2 runner: rename to `package.json` on the OBS host, `npm install` (`obs-websocket-js`), then run the `.mjs`. |
| `discoverSwitcherEvents.mjs` | Phase 4.2 discovery: subscribes to a broad event set and dumps every OBS WebSocket event after a file write, to find which event (if any) the plugin fires on switch. |
| `probeSwitcherMechanism.mjs` | Probes the plugin's switching mechanism: dumps `ss_large` settings, polls scene-item enable state after a file write, checks whether `current_index` updates, then restores the file. |
| `dumpInputState.mjs` | Dumps a switcher input's settings/state over OBS WebSocket for ad-hoc inspection. |

### Shell

| File | Description |
|---|---|
| `capturePhase05Snapshot.sh` | Phase 0.5.1 + 0.5.3 snapshot capture: SSHes the Windows OBS host once to gather host info and file snapshots (npm `snapshot:phase05`; positional args require the `--` separator through npm). |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `streamlink-supervisor/` | Streamlink→ffmpeg supervisor: RestartTracker, PortAllocator, command builders, StreamPipeline, `/health` server (see `streamlink-supervisor/AGENTS.md`) |
| `convertBrowserToMedia/` | Scene-collection browser→ffmpeg converter with OBS-running check, timestamped backup, dry-run diff (see `convertBrowserToMedia/AGENTS.md`) |
| `loadDriver/` | setActive load driver internals: picker, schedule, classifier, stats, reporter (see `loadDriver/AGENTS.md`) |
| `atomicWriteSoak/` | Atomic-write soak internals (`.ts` + `.mjs` ports): strategies, read classifier, soak loop, reporter (see `atomicWriteSoak/AGENTS.md`) |
| `obs-metrics-scraper/` | PowerShell + Task Scheduler OBS process-metrics logger (see `obs-metrics-scraper/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Most TypeScript scripts run via `tsx scripts/<name>.ts` and are wired to npm scripts in the repo `package.json` — prefer the npm alias when one exists.
- Top-level module entry files (`*.ts`/`*.mjs`) are thin: parse CLI flags / env, then call into the same-named subdirectory where the testable logic lives. Put new logic in the subdir, not the entry.
- `.mjs` ports (`atomicWriteSoak.mjs`, the `*Switcher*.mjs` files) exist to run on the Windows OBS host without `tsx`. If you change a `.ts` that has an `.mjs` mirror, mirror the change.
- DB scripts resolve `sources.db` under `FILE_DIRECTORY` (default `./files`) and use `lib/constants` table-name helpers.

### Testing Requirements

- The five module subdirectories have `__tests__/` suites run by the repo-root Jest (`npm test`). Top-level utility/diagnostic scripts are not unit-tested.
- Add tests to the relevant subdir's `__tests__/` when changing module logic.

### Common Patterns

- Latency/SLO scripts emit a console summary plus a JSON report and use exit code 0 (pass) / 1 (fail) so they gate CI/runbooks.
- OBS-touching diagnostics talk to OBS WebSocket (`ws://127.0.0.1:4455`, no auth) via `obs-websocket-js`.
- Phase numbers (1.3, 1.4, 2.2, 3.2, 4.2, 0.5.x) reference the Stream-a-Thon plan under `.omc/plans/`.

## Dependencies

### Internal

- `lib/database`, `lib/constants` — DB access and table-name helpers
- `lib/streamInputConfig` — shared `ffmpeg_source` settings shape (used by the converter)

### External

- `tsx` (TS execution), `sqlite` / `sqlite3` (DB scripts), `obs-websocket-js` (OBS diagnostics)
- Host binaries: `streamlink`, `ffmpeg` (supervisor); PowerShell (metrics scraper); `ssh` (snapshot capture)

<!-- MANUAL: notes below preserved on regeneration -->
