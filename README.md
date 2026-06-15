<div align="center">

# CueSheet

**Mission control for multi-stream broadcasts** — run dozens of live Twitch streams through OBS, switch layouts on the fly, and keep every pipeline alive, all from one terminal-styled console.

[![ci](https://github.com/derekslenk/cuesheet/actions/workflows/build.yml/badge.svg)](https://github.com/derekslenk/cuesheet/actions/workflows/build.yml)
![Next.js 15](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)
![Bun](https://img.shields.io/badge/CLI-Bun-f9f1e1?logo=bun&logoColor=black)

</div>

<p align="center">
  <img src="docs/images/obs-4screen-output.jpg" alt="Live 4-stream OBS layout produced by CueSheet" width="900">
</p>
<p align="center"><em>The real output: a 4-Screen OBS layout assembled and switched live by CueSheet — one Media Source per stream, auto-generated team labels, no browser sources.</em></p>

CueSheet is a [Next.js](https://nextjs.org) control surface for marathon-style multi-stream events (think charity stream-a-thons): a single operator assigns live Twitch streams to screen positions, flips OBS between 1/2/4-screen layouts with studio-mode preview, and lets an external Streamlink supervisor keep dozens of low-memory video pipelines running — with live status for all of it.

## Highlights

**Broadcast control**
- Full studio mode support: preview/program scene management with transition control ("GO LIVE")
- One-click OBS layout switching (1-Screen, 2-Screen, 4-Screen) with dynamic button states
- 7 assignable screen positions: large, left, right, and all four corners
- Real-time OBS WebSocket integration with connection, scene, and studio-mode status in the footer

**Stream & team management**
- Create, edit, and delete streams and teams with full OBS cleanup (scenes, sources, text files)
- Streams organized into collapsible team groups, synced to OBS group scenes
- Auto-generated team/streamer labels rendered as OBS text sources — unified plate style with per-team colors, auto-centered
- UUID-based group tracking survives renames; duplicate stream submissions are rejected (HTTP 409)

**Low-memory media pipeline**
- Streams are OBS **Media Sources** (`ffmpeg_source`) fed by an external Streamlink → ffmpeg → UDP relay, ~44 MB per stream
- No per-stream CEF/Chromium instance (browser sources exhaust OBS memory around ~40 streams) — OBS only decodes MPEG-TS
- Standalone supervisor auto-respawns failed pipelines (escalating after repeated crashes) and hot-reloads when streams are added or removed — no restarts
- Deterministic per-stream relay ports computed independently by both sides; browser-source fallback one env var away

**Built for event ops**
- `EVENT_KEY` switches the whole app to a new event's tables — no source edits, no rebuild
- Single cross-platform `cuesheet` binary: web UI, supervisor, TUI monitors, and ops tools in one executable
- Optional API key authentication for production deployments
- Dual OBS integration: WebSocket API + Source Switcher text-file monitoring for maximum compatibility

## The control room

<p align="center">
  <img src="docs/images/webui-home.png" alt="CueSheet control center" width="820">
</p>
<p align="center"><em>The control center: assign any stream to any screen position, set the preview layout, and go live — with OBS and supervisor status always in view.</em></p>

<p align="center">
  <img src="docs/images/webui-streams.png" alt="Stream management page" width="820">
</p>
<p align="center"><em>Stream management: add by Twitch username or URL, grouped by team, with per-stream pipeline start/stop/preview and live status badges.</em></p>

<p align="center">
  <img src="docs/images/supervisor-dashboard.png" alt="Streamlink supervisor dashboard" width="900">
</p>
<p align="center"><em>The supervisor dashboard (<code>:8080</code>): every pipeline's state, restart count, and UDP relay target — crashed pipelines are respawned automatically and escalate if they keep failing.</em></p>

<details>
<summary><strong>More screenshots</strong> — teams, settings, performance</summary>
<br>
<p align="center">
  <img src="docs/images/webui-teams.png" alt="Team management page" width="780">
  <br><em>Team management with OBS group verification and one-click sync.</em>
</p>
<p align="center">
  <img src="docs/images/webui-settings.png" alt="Settings page" width="780">
  <br><em>API key auth and OBS playback policy re-application.</em>
</p>
<p align="center">
  <img src="docs/images/webui-performance.png" alt="Performance metrics page" width="780">
  <br><em>Built-in API latency metrics.</em>
</p>
</details>

## How it works

```mermaid
flowchart LR
    TW(["Twitch"])

    subgraph WEB["CueSheet webui  (:3000)"]
        UI["Next.js UI + API routes"]
        DB[("SQLite<br/>streams_* / teams_*")]
    end

    subgraph SUP["Streamlink supervisor  (:8080)"]
        SL["streamlink"] -- "MPEG-TS" --> FF["ffmpeg -c copy"]
    end

    subgraph OBS["OBS Studio"]
        MS["Media Source per stream<br/>(ffmpeg_source)"]
        SSW["Source Switcher plugin"]
    end

    TW --> SL
    UI --- DB
    DB -. "stream list" .-> SUP
    UI -- "POST /reload" --> SUP
    FF -- "udp://127.0.0.1:&lt;port&gt;" --> MS
    UI <-- "WebSocket  (:4455)" --> OBS
    UI -- "writes &lt;screen&gt;.txt" --> SSW
```

- The **webui** owns the database and OBS: it creates scenes/sources over the OBS WebSocket and writes `<screen>.txt` files that the [Source Switcher](https://github.com/exeldro/obs-source-switcher) plugin polls every second.
- The **supervisor** reads the same stream list and runs one `streamlink → ffmpeg → UDP` pipeline per stream. Both sides independently compute the same relay port from the stream's database `id` (`lib/relayPort.ts`) — no coordination needed.
- Adding or removing a stream pings the supervisor's `POST /reload` (best-effort), so pipelines start and stop **without restarting anything**.
- Each stream's on-screen **label** is a transparent HTML browser source (`/overlay/stream/<id>`) in its nested scene — per-team colors + logo, role chip, live Twitch viewer count, entrance animation. See [`docs/stream-labels-runbook.md`](docs/stream-labels-runbook.md) (test tooling, health panel, env vars, `LABEL_RENDERER=obs` revert) and [`docs/overlay-label-design.md`](docs/overlay-label-design.md).

## Quick start

```bash
npm install
npm run dev          # web UI on http://localhost:3000
npm run supervisor   # Streamlink supervisor (run on the OBS host)
```

`streamlink` and `ffmpeg` must be on PATH (or set `STREAMLINK_PATH` / `FFMPEG_PATH`). Run `cuesheet doctor` to verify your setup.

### Production build

`next.config.ts` sets `output: "standalone"`, so `npm run build` emits a
self-contained bundle at `.next/standalone` (a `server.js` plus a minimal
`node_modules` that includes the `sqlite3` native module). Deploy by copying
that folder alongside `.next/static` and `public`, then:

```bash
node .next/standalone/server.js
```

No `next start` and no full `npm install` on the host. The bundle includes the
**host platform's** prebuilt native modules, so build on the target OS — for the
Windows OBS host, run `npm run build` on Windows.

The Streamlink supervisor can likewise be shipped as a single `.exe` — see
[`scripts/streamlink-supervisor/README.md`](scripts/streamlink-supervisor/README.md#single-executable-build-bun).

## Unified `cuesheet` binary

The old per-task launch scripts (`run-dev.cmd`, `run-sup.cmd`, `watch.ps1`,
`gui.ps1`, `mon-start.ps1`, …) have been replaced by a **single cross-platform
binary**, `cuesheet`, built with `bun build --compile`. One executable runs the
web UI, the Streamlink supervisor (compiled in — no `tsx`), the monitors, and the
ops/test tools on Windows, macOS, and Linux.

### Download (GitHub releases)

Each tagged release attaches a prebuilt binary per platform (verify against
`SHA256SUMS.txt`):

| File | Platform |
| --- | --- |
| `cuesheet-windows-x64.exe` | Windows x64 |
| `cuesheet-macos-arm64` | macOS (Apple Silicon) |
| `cuesheet-macos-x64` | macOS (Intel) |
| `cuesheet-linux-x64` | Linux x64 |

The binary is self-contained — no Node/Bun/`node_modules` needed. The only runtime
dependencies are `streamlink` and `ffmpeg` on PATH (run `cuesheet doctor` to check).
On macOS/Linux, `chmod +x` the download first.

> **Standalone vs. repo-only.** The released binary runs the supervisor and all
> monitoring/ops commands anywhere: `sup`, `status`, `watch`, `gui`, `start`/`stop`,
> `doctor`, `loadtest`, `soak`, `clean-obs`, `measure-latency`. Two things need a repo
> checkout (project source + `node_modules`), not a standalone download: **`cuesheet dev`**
> (it runs the Next.js dev server) and **`cuesheet start --which deck`** (the Stream Deck
> sidecar runs via Node + tsx — see [`scripts/streamdeck/README.md`](scripts/streamdeck/README.md)).
> For a production webui, deploy the `next build` standalone bundle (see "Production
> build" above).

Cut a release by pushing a tag — `git tag v0.1.0 && git push origin v0.1.0` — and the
[`release` workflow](.github/workflows/release.yml) cross-compiles every target and
publishes them with checksums.

### Build (from source)

```bash
npm run binary:build:win     # -> dist/cuesheet.exe   (Windows x64)
npm run binary:build:mac     # -> dist/cuesheet-macos (macOS arm64)
npm run binary:build:linux   # -> dist/cuesheet-linux (Linux x64)
npm run binary:build         # -> dist/cuesheet       (host-native)
npm run binary:smoke         # smoke-test a built binary (--help / status / doctor)
```

During development you can run the same CLI without compiling:

```bash
npm run cli:dev -- <command>        # e.g. npm run cli:dev -- status
# or directly: bun run src/cli/main.ts <command>
```

### Commands

```
cuesheet dev                                   # Next.js web UI (:3000) — spawns `next dev`
cuesheet sup                                   # Streamlink supervisor (:8080) — runs in-process
cuesheet start [--which both|sup|web|deck]     # launch detached (tracked). 'deck' is opt-in; never part of 'both'
cuesheet stop  [--which both|sup|web|deck]     # stop exactly what `start` launched
cuesheet status [--json|--logs|--diagnose]     # one-shot status (exit 0 = all up); includes a stream-deck row
cuesheet watch                                 # live status, refreshes every 2s
cuesheet gui                                   # full-screen TUI control center ([s] start [x] stop [r] restart [d] deck)
cuesheet doctor                                # diagnose deps, ports, paths, resolved config
cuesheet loadtest | loaddriver | soak | clean-obs | measure-latency | verify-switcher-coverage
```

`cuesheet stop` tracks the PIDs it launched (in a managed run-state file) and
terminates only those process groups — unlike the old `mon-stop.ps1`, it never
blanket-kills unrelated `node` / `ffmpeg` / `streamlink` processes (e.g. a
running load test). Config resolution follows precedence **flag -> env ->
`.env.local` -> built-in default**; run `cuesheet doctor` to see every resolved
value and where it came from.

**Stream Deck control (opt-in).** An Elgato Stream Deck XL can drive cuesheet as a
physical control surface — assign streamers to slots, switch OBS layouts, cut live.
Run it in the foreground with `npm run deck`, or as a tracked process with
`cuesheet start --which deck` (toggle it from `gui` with the **`d`** key, stop it
with `cuesheet stop --which deck`). It is opt-in — never started by plain
`start`/`stop` or the TUI `s`/`x`/`r` keys — and talks only to the existing
localhost HTTP API, so it makes no backend changes. See
[`scripts/streamdeck/README.md`](scripts/streamdeck/README.md) for setup, the config
env vars, and the localhost-only security note.

### Migration from the old scripts

| Old (Windows-only)            | New (all platforms)                       |
| ----------------------------- | ----------------------------------------- |
| `run-dev.cmd`                 | `cuesheet dev`                            |
| `run-sup.cmd`                 | `cuesheet sup`                            |
| `watch.cmd` / `watch.ps1`     | `cuesheet watch`                          |
| `status.cmd` / `status.ps1`   | `cuesheet status`                         |
| `mon-start.ps1`               | `cuesheet start --which both\|sup\|web`   |
| `mon-stop.ps1`                | `cuesheet stop`                           |
| `gui.cmd` / `gui.ps1`         | `cuesheet gui`                            |
| `monitor.cmd` (.NET WPF)      | `cuesheet gui` (cross-platform TUI)       |

> The .NET WPF monitor (`monitor/CueSheetMonitor.*`) is **deprecated** in favor
> of the cross-platform `cuesheet gui` TUI and will be removed in a follow-up.

## Configuration

### Environment Variables

Create `.env.local` in the project root:

```env
# File storage directory (optional, defaults to ./files)
FILE_DIRECTORY=C:\\OBS\\source-switching

# Event key — selects the per-event tables: streams_<EVENT_KEY> / teams_<EVENT_KEY>
# (optional, defaults to 2026_summer_sat). Lowercase letters, digits, underscores.
# Set the SAME value for the webui and the streamlink supervisor so they agree.
EVENT_KEY=2026_summer_sat

# OBS WebSocket settings (optional, these are defaults)
OBS_WEBSOCKET_HOST=127.0.0.1
OBS_WEBSOCKET_PORT=4455
OBS_WEBSOCKET_PASSWORD=your_password_here

# Security (IMPORTANT: Set in production)
API_KEY=your_secure_api_key_here

# Team-label plate anchoring (legacy OBS-native labels only): "left" (default)
# or "center". Applies to streams created AFTER a change; delete + re-add.
LABEL_PLATE_ANCHOR=left

# --- HTML stream labels (browser-source overlay) — see docs/stream-labels-runbook.md ---
# Renderer: "html" (default — one transparent browser source per stream at
# /overlay/stream/<id>) or "obs" (legacy 5-input native text labels, the revert).
LABEL_RENDERER=html
# Destroy a label's browser source when its cell isn't shown (default true —
# bounds CEF memory). The Phase-2 live spike decides the final posture.
LABEL_SHUTDOWN_WHEN_HIDDEN=true
# Base URL OBS's browser source uses to reach this app (default below). Set to
# http://<host-ip>:3000 if OBS runs on another LAN machine.
LABEL_OVERLAY_BASE_URL=http://localhost:3000
# Twitch app credentials for live viewer counts + the live-stream test seeder.
# Create an app at https://dev.twitch.tv/console/apps. Optional — the viewer
# count is simply omitted when unset.
TWITCH_CLIENT_ID=
TWITCH_CLIENT_SECRET=

# --- Streamlink Media-Source pipeline (webui side) ---
# Set to "false" to roll back to legacy browser sources pointed at the Twitch URL
STREAM_USE_FFMPEG=true
# Where the webui pings POST /reload after add/remove (default below)
SUPERVISOR_URL=http://127.0.0.1:8080
# Deterministic relay-port mapping (MUST match the supervisor's values)
RELAY_HOST=127.0.0.1
RELAY_BASE_PORT=9000
RELAY_PORT_RANGE=2000
```

**`EVENT_KEY`** is the single knob that makes CueSheet generic across events.
Each event's data lives in its own pair of tables, `streams_<EVENT_KEY>` and
`teams_<EVENT_KEY>`. Point the app at a new event by setting `EVENT_KEY` in the
environment — no source edit, no rebuild. The webui (which writes those tables)
and the Streamlink supervisor (which reads them) must use the **same**
`EVENT_KEY`. An invalid value fails fast at startup rather than silently using
the wrong table.

#### Streamlink supervisor (runs on the OBS host)

The supervisor reads the same `.env`/environment as the webui (so the `RELAY_*`
and `EVENT_KEY` values match) plus its own settings:

```env
# Absolute paths to the binaries on the OBS host (recommended on Windows)
STREAMLINK_PATH=C:\\path\\to\\streamlink.exe
FFMPEG_PATH=C:\\path\\to\\ffmpeg.exe

# HTTP control/health server (dashboard at /, JSON at /health, POST /reload)
SUPERVISOR_HEALTH_HOST=127.0.0.1
SUPERVISOR_HEALTH_PORT=8080

# Per-stream log files (rotated)
SUPERVISOR_LOG_DIR=./logs/streamlink-supervisor
SUPERVISOR_LOG_MAX_BYTES=10485760
SUPERVISOR_LOG_RETAIN=5

# Optional: override the streams table the supervisor reads (defaults to the
# EVENT_KEY table, streams_<EVENT_KEY>); fallback port allocator for streams
# without a deterministic relay port (used mainly in tests)
STREAMS_TABLE=
SUPERVISOR_BASE_PORT=9001
SUPERVISOR_MAX_PORTS=8
```

> The webui (ffmpeg_source `input`) and the supervisor (UDP relay target)
> independently compute the **same** `udp://RELAY_HOST:(RELAY_BASE_PORT + id % RELAY_PORT_RANGE)`
> from the stream's database `id` — so `RELAY_HOST`, `RELAY_BASE_PORT`, and
> `RELAY_PORT_RANGE` must be identical on both. See `lib/relayPort.ts`.

### Security Setup

**⚠️ IMPORTANT**: Set `API_KEY` in production to protect your OBS setup from unauthorized access.

Generate a secure API key:
```bash
# Generate a random 32-character key
openssl rand -hex 32
```

Without an API key, anyone on your network can control your OBS streams.

### OBS Source Switcher Setup

1. In OBS, configure Source Switcher properties
2. Enable "Current Source File" at the bottom
3. Point to one of the generated text files (e.g., `large.txt`, `left.txt`)
4. Set read interval to 1000ms
5. Sources will switch automatically when files change

See [`docs/OBS_SETUP.md`](docs/OBS_SETUP.md) for the full OBS walkthrough.

> **System scenes.** Infrastructure scenes that contain the source switchers
> (1-Screen, 2-Screen, 4-Screen, Starting, Ending, Audio, Movies, Resources,
> Donor, BRB) are excluded from orphaned-group detection. Additional scenes can
> be added to the `SYSTEM_SCENES` array in `app/api/verifyGroups/route.ts`.

### Streamlink Media-Source pipeline

By default (`STREAM_USE_FFMPEG` unset or `true`), adding a stream creates an OBS
**Media Source** (`ffmpeg_source`) whose `input` is a **local UDP relay**
(`udp://127.0.0.1:<port>`), not the Twitch URL. This avoids spawning a full
CEF/Chromium instance per browser source (which exhausts OBS memory around ~40
streams); OBS only has to decode the incoming MPEG-TS.

A standalone **Streamlink supervisor** feeds those relays. Per stream it runs
roughly:

```bash
streamlink --stdout --hls-live-restart <twitchUrl> best \
  | ffmpeg -re -i pipe:0 -c copy -f mpegts "udp://127.0.0.1:<port>?pkt_size=1316"
```

Run it on the OBS host (alongside the webui and OBS):

```bash
npm run supervisor
```

- **Deterministic port**: both the webui (`ffmpeg_source` input) and the
  supervisor (relay target) compute the same port from the stream's database
  `id` via `lib/relayPort.ts` — no coordination or shared registry.
- **Control server**: the supervisor serves a status dashboard at `/`, JSON at
  `GET /health`, and accepts `POST /reload` (default `http://127.0.0.1:8080`,
  via `SUPERVISOR_HEALTH_PORT`).
- **Live reload**: after `addStream` and after team/stream deletion the webui
  pings `POST /reload` (`lib/supervisorClient.ts`, `SUPERVISOR_URL`), so the
  supervisor starts pipelines for newly-added streams and stops removed ones
  **without a restart**. This is best-effort — the add/remove still succeeds if
  the supervisor is down.
- **Auto-respawn**: pipelines are restarted on exit, escalating after 3
  restarts within 30s.
- **Rollback**: set `STREAM_USE_FFMPEG=false` to make `addStream` create a
  muted `browser_source` pointed at the Twitch URL instead (legacy behavior).

`streamlink` and `ffmpeg` must be installed on the OBS host; point the
supervisor at them with `STREAMLINK_PATH` / `FFMPEG_PATH`. The Source Switcher
`.txt`-file mechanism is unchanged — `setActive` still writes the stream-group
name and the OBS plugin polls each `${screen}.txt` every 1000ms.

### Database Setup

The project includes an empty template database for easy setup:

```bash
# Option 1: Use template database directly (development)
# Database will be created in ./files/sources.db
npm run create-sat-summer-2025-tables

# Option 2: Set up custom database location (recommended)
# 1. Copy the template database
cp files/sources.template.db /path/to/your/database/sources.db

# 2. Set environment variable in .env.local
echo "FILE_DIRECTORY=/path/to/your/database" >> .env.local

# 3. Create tables in your custom database
npm run create-sat-summer-2025-tables
```

**Template Database**: The repository includes `files/sources.template.db` with the proper schema but no data. Your local development database (`sources.db`) is automatically ignored by git to prevent committing personal data.

## Development Commands

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm run start        # Start production server
npm run lint         # Run ESLint
npm run type-check   # TypeScript validation
npm test             # Run Jest test suite
npm run supervisor   # Run the Streamlink supervisor (streamlink+ffmpeg per stream)
```

### Operational / migration scripts

```bash
npm run convert:browser-to-media     # Convert existing browser sources to ffmpeg_source Media Sources
npm run verify:switcher-coverage     # Verify every webui-written name is covered by the OBS source switchers
npm run clean:obs-collection         # Clean up an OBS scene collection (season transitions)
npm run measure:switcher-latency     # Measure source-switch latency
npm run remap:mac-obs-switcher-paths # Remap switcher .txt paths for a macOS OBS install
npm run audit:sqlite-opens           # Audit SQLite open/close handling
npm run load:setactive               # Load-test the setActive endpoint
```

## Architecture

- **Frontend**: Next.js 15 with React 19 and TypeScript, CRT phosphor-terminal theme
- **Backend**: Next.js API routes with SQLite database
- **OBS Integration**: WebSocket connection + Source Switcher text-file monitoring
- **Media pipeline**: Streamlink supervisor → per-stream ffmpeg → local UDP relay → OBS `ffmpeg_source` Media Source (deterministic port via `lib/relayPort.ts`; live reload via `lib/supervisorClient.ts`)
- **CLI**: single `cuesheet` binary built with Bun (`src/cli/`)
- **CI/CD**: GitHub Actions (`.github/workflows/`), gated by a single required `ci-ok` check

## Documentation

| Doc | What's in it |
| --- | --- |
| [`docs/API.md`](docs/API.md) | Complete REST API reference (streams, teams, source control, scenes, status) |
| [`docs/OBS_SETUP.md`](docs/OBS_SETUP.md) | OBS + Source Switcher setup walkthrough |
| [`docs/RUNBOOK_EVENT.md`](docs/RUNBOOK_EVENT.md) | Event-day runbook |
| [`docs/RUNBOOK_FALLBACK.md`](docs/RUNBOOK_FALLBACK.md) | Fallback / rollback procedures |
| [`docs/plugin-contract.md`](docs/plugin-contract.md) | Source Switcher plugin contract |
| [`docs/schema.md`](docs/schema.md) | Database schema |
| [`scripts/streamdeck/README.md`](scripts/streamdeck/README.md) | Stream Deck XL control surface (`npm run deck`) |
| [`AGENTS.md`](AGENTS.md) | Detailed architecture documentation |

All API endpoints support API key authentication for production deployments.
