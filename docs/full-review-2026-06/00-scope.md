# Review Scope

## Target

**Whole repo / working tree** of `cuesheet` — a Next.js 16 control-plane application for orchestrating multi-stream live events (OBS WebSocket scene control, streamlink supervisor sidecar, Stream Deck XL hardware control, HTML browser-source overlays, Twitch live-data integration, and a Bun-compiled CLI/TUI).

Reviewed on branch `feat/html-stream-labels` (PR #38 in review). The working tree currently sits on top of recently-merged dependency modernization (Next 16 / React 19.2 / TS 6 / sqlite3 6) and the Stream Deck XL feature (PR #37, merged).

## Files

Whole application codebase, excluding `node_modules/`, `.next/`, `dist/`, `coverage/`, `logs/`, `files/`, `release/`, and the large `obs-scene/` JSON fixtures. Approx. **27,000 LOC** across:

| Area | Files | LOC | Notes |
|------|-------|-----|-------|
| `app/` | 48 | 5,815 | Next.js App Router: pages, layout, **24 API routes** (`app/api/**/route.ts`), overlay route group `app/(overlay)/overlay/stream/[id]` |
| `lib/` | 40 | 5,661 | Core libs: `database.ts`, `obsClient.js`, `twitch.ts`, `overlayData.ts`, `overlayMetrics.ts`, `streamLabel.js`, `liveSeed.ts`, `envFile.ts`, `supervisorClient.ts`, `apiHelpers`, `atomicWrite` |
| `scripts/` | 99 | 11,215 | `streamlink-supervisor/`, `streamdeck/`, `convertBrowserToMedia/`, `loadDriver/`, `atomicWriteSoak/`, event setup/clone/switch scripts, importFromSheet |
| `src/cli/` | 35 | 4,470 | Bun-compiled CLI + TUI (`commands/`, `lib/`, `types/`) |
| `components/` | 12 | 1,593 | React UI components (Dropdown, Toast, ErrorBoundary, etc.) |
| `contexts/` | 1 | 56 | React context |
| `types/` | 2 | 39 | Shared TS types |

**API surface (24 routes):** addStream, counts, createGroup, getActive, getCurrentScene, getTeamName, obsPlaybackSettings, obsStatus, overlay/[id], overlay/[id]/viewers, overlay/health, preview/[...slug], setActive, setScene, streams, streams/[id], supervisor/health, supervisor/streams/[id]/{start,stop,restart}, syncGroups, teams, teams/[teamId], triggerTransition, verifyGroups.

**Test coverage:** ~75 test files (Jest 30, ts-jest, jsdom + @testing-library/react) across lib, app/api, components, src/cli, and the script subsystems.

## Priority focus

While the target is the whole repo, the highest-risk / freshest surface (recent `feat/html-stream-labels` work, ~3,900 insertions across 63 files vs `main`) should receive deepest scrutiny:

- HTML stream-label browser-source pipeline: `lib/streamLabel.js`, `lib/overlayData.ts`, `lib/overlayMetrics.ts`, `app/(overlay)/overlay/stream/[id]`, `app/api/overlay/**`.
- Twitch live-data integration: `lib/twitch.ts`, `lib/liveSeed.ts`, viewer-count routes.
- Data layer & multi-event safety: `lib/database.ts`, event setup/clone/switch scripts, team branding columns.
- External integration boundaries: `lib/obsClient.js`, `scripts/streamlink-supervisor/`, `scripts/streamdeck/`.

## Stack / tooling (auto-detected)

- **Framework:** Next.js 16.2 (App Router) + React 19.2, TypeScript 6, Tailwind 4.
- **Runtime:** Node ≥22; Bun used to compile the CLI (`src/cli/main.ts`) and supervisor sidecar to native binaries.
- **Data:** SQLite via `sqlite3` 6 + `sqlite` 5 wrapper.
- **Integrations:** `obs-websocket-js` 5, `@elgato-stream-deck/node` 7, `ws` 8, `hls.js`, `@napi-rs/canvas`.
- **Quality gates:** ESLint 9 (`eslint-config-next`), Jest 30, `tsc --noEmit` (multiple tsconfigs: base, bun, deck). CI aggregate gate `ci-ok` (per project memory).

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 16 + React 19 (TypeScript) — multi-runtime (Node + Bun sidecars)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
