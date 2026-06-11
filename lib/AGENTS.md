<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# lib

## Purpose

Core, framework-agnostic logic for CueSheet — the Next.js web app that controls OBS Studio for live-stream production. This directory holds the OBS WebSocket orchestration client, the SQLite data layer, shared constants, input validation, performance hooks, and the atomic file-write primitive that drives the upstream **obs-source-switcher** OBS plugin. The plugin itself is external (github.com/exeldro/obs-source-switcher); CueSheet steers it by writing per-screen `${screen}.txt` files and by mutating the plugin's 7 OBS switcher inputs over WebSocket.

## Key Files

| File | Description |
|------|-------------|
| `obsClient.js` | OBS WebSocket orchestration (CommonJS). Singleton connection manager (`ensureConnected`, `getOBSClient`, `getConnectionStatus`, `disconnectFromOBS`) plus all scene/source operations: `createStreamGroup` (V1, browser_source), `createStreamGroupV2` (ffmpeg_source-capable via `useFfmpegSource`), `createGroupIfNotExists`, `addSourceToGroup`, `createTextSource`, `addSourceToSwitcher`/`removeSourceFromSwitcher` (mutate the plugin input's `sources` array), `deleteStreamComponents`, `deleteTeamComponents`, `clearTextFilesForStream`. |
| `constants.ts` | Single source of truth for table-name generation (`getTableName`, `DEFAULT_TABLE_CONFIG` → `teams_2026_summer_sat` / `streams_2026_summer_sat`), `SCREEN_POSITIONS` (7 screen basenames → `${screen}.txt`), and `SOURCE_SWITCHER_NAMES` (7 canonical OBS input names with `ss_` prefix, e.g. `ss_large`). Also exports `cleanObsName`. NOTE: switcher input names carry the `ss_` prefix; the polled text files do **not**. |
| `database.ts` | SQLite lifecycle. Lazily opens `${FILE_DIRECTORY}/sources.db` (default `./files`) as a process-wide singleton, ensures the directory exists, and `initializeDatabase` runs idempotent `CREATE TABLE IF NOT EXISTS` for the streams/teams tables named via `TABLE_NAMES`. |
| `db.ts` | `withDb(callback)` helper — runs a callback against the shared `getDatabase()` singleton. Callers must not close the connection; it persists for the process lifetime. |
| `atomicWrite.ts` | `atomicWriteFileSync(targetPath, payload)` — writes to a unique sibling `.tmp-` file then `renameSync` over the destination, so the polling plugin never reads a torn `${screen}.txt`. Backed by Phase 2.2 soak evidence (see `docs/plugin-contract.md`). |
| `streamInputConfig.js` | Builds OBS input settings for stream sources (CommonJS). `buildStreamInputConfig` returns `browser_source` (V1 parity) or `ffmpeg_source` (Media Source / Streamlink, `restart_on_activate:true`) settings; `createStreamInput` creates + configures + mutes the input. Consumed by `createStreamGroupV2`. |
| `labelLayout.js` | Pure geometry helper for team/streamer label overlay boxes (CommonJS). Exports `computeLabelLayout({ measuredWidth, measuredHeight, textLength, fontSize, boxTopY })` → `{ boxWidth, boxHeight, centerX, centerY }` plus tuning constants `LABEL_VPAD`, `LABEL_HPAD`, `MIN_LABEL_WIDTH`, `LABEL_GAP`. Used by `createStreamGroupV2` to size color sources from measured text bounds (polling `GetSceneItemTransform`) with font-metric fallback. |
| `streamGroupName.ts` | `buildStreamGroupName(stream)` derives the switcher-file value (e.g. `jellyfish_palpatine_stream`) from group/team + stream name. Must stay in sync with `app/api/setActive/route.ts`. |
| `apiClient.ts` | Client-side authenticated `fetch` wrapper. Reads API key from `process.env.API_KEY` (server) or `localStorage['obs-api-key']` (browser), sets `x-api-key`. Exports `apiClient.{get,post,put,delete}`. |
| `apiHelpers.ts` | Server-side Next.js route helpers: standardized `createErrorResponse`/`createSuccessResponse`/`createValidationError`/`createDatabaseError`/`createOBSError`, `withErrorHandling` wrapper, and `parseRequestBody` with optional validator. |
| `security.ts` | Input validation/sanitization. `VALID_SCREENS`, `isValidScreen`, `isValidUrl`, `isPositiveInteger`, `validateInteger`, `sanitizeString`, plus `validateStreamInput`/`validateScreenInput` schema validators. |
| `performance.ts` | Client-side React performance utilities: `useDebounce`, `useThrottle`, stream lookup maps (`createStreamLookupMaps`/`useStreamLookupMaps`/`useActiveSourceLookup`), `PerformanceMonitor`, `usePageVisibility`, and `useSmartPolling` (pauses polling when tab hidden). |
| `useToast.ts` | `useToast` React hook managing toast notification state with `showSuccess`/`showError`/`showWarning`/`showInfo` convenience methods. |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `__tests__/` | Jest unit tests for `apiHelpers`, `atomicWrite`, `database` (schema-drift guard), `obsClient`/`streamInputConfig`, and `useToast`. See `__tests__/AGENTS.md`. |

## For AI Agents

### Working In This Directory

- `obsClient.js` and `streamInputConfig.js` are **CommonJS** (`require`/`module.exports`); the rest are ESM TypeScript. Don't convert one to the other casually — they're imported across that boundary.
- The OBS connection is a module-level singleton. `ensureConnected` de-dupes concurrent connects; event handlers null out `obs` on close/error so the next call reconnects. Read `OBS_WEBSOCKET_HOST`/`PORT`/`PASSWORD` from env.
- `createStreamGroup` (V1) is the rollback target and must stay untouched when working on V2; `createStreamGroupV2` is the parallel path that can emit `ffmpeg_source` inputs. Flip `useFfmpegSource:false` to fall back per-stream.
- Switcher-file values, OBS source names, and `SOURCE_SWITCHER_NAMES` must all stay mutually consistent. The `_stream` suffix convention is duplicated in `streamGroupName.ts`, `performance.ts`, and `obsClient.js` — change them together.
- Never close the DB inside a `withDb` callback; the singleton owns the lifecycle.

### Testing Requirements

- Run `npm test`. The schema-drift guard in `__tests__/database.test.ts` pins the `CREATE TABLE` columns to what runtime route SELECTs need — keep `database.ts` and that test in lockstep.
- `atomicWrite.test.ts` asserts no leftover `.tmp-` siblings and cleanup on rename failure; preserve those invariants when touching `atomicWrite.ts`.

### Common Patterns

- File writes to switcher `${screen}.txt` go through `atomicWriteFileSync`, never raw `fs.writeFileSync` (the plugin polls at ~1000 ms and would observe a torn read).
- Table names are always derived via `getTableName`/`TABLE_NAMES`, never hard-coded with a year.
- API routes wrap handlers in `withErrorHandling` and return via the `apiHelpers` response builders.

## Dependencies

### Internal

- `constants.ts` ← consumed by `obsClient.js`, `database.ts`, `security.ts` (screen lists), and the schema test.
- `database.ts` ← `db.ts`; both ← API routes under `app/api/`.
- `streamInputConfig.js` ← `obsClient.js` (`createStreamGroupV2`).

### External

- `obs-websocket-js` — OBS WebSocket v5 client.
- `sqlite3` + `sqlite` — async SQLite driver/wrapper.
- `next/server` — `NextResponse` in `apiHelpers.ts`.
- `react` — hooks in `performance.ts`, `useToast.ts`.
- `@/components/Toast` — `Toast`/`ToastType` types for `useToast`.

<!-- MANUAL: notes below preserved on regeneration -->
