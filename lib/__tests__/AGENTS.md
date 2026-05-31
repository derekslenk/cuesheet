<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# lib/__tests__

## Purpose

Jest unit tests for the CueSheet core library (`lib/`). These cover the pure/deterministic seams — API response helpers, the atomic file-write primitive, the SQLite schema-bootstrap contract, the OBS stream-input config builder, and the toast hook. They are guard tests: several exist to turn previously-discovered production failures (schema drift, torn file writes) into CI failures rather than event-day surprises.

## Key Files

| File | Description |
|------|-------------|
| `apiHelpers.test.ts` | Tests `lib/apiHelpers.ts` response builders (`createErrorResponse`, `createSuccessResponse`, `createValidationError`, `createDatabaseError`, `createOBSError`) and `parseRequestBody`. Mocks `next/server`'s `NextResponse.json`. |
| `atomicWrite.test.ts` | Tests `lib/atomicWrite.ts`: payload is written, no `.tmp-` siblings remain after success, overwrite path works, tmp paths are unique under rapid succession, and the tmp file is cleaned up when `renameSync` throws. Uses a real temp dir + `fs` spies. |
| `database.test.ts` | Phase 0.8.3 schema-bootstrap drift guard. Runs `initializeDatabase` against an in-memory/temp SQLite DB and pins the `CREATE TABLE` columns to those referenced by runtime route SELECTs, so schema drift fails CI. |
| `obsClient.test.js` | Tests `lib/streamInputConfig.js` (`buildStreamInputConfig`, `createStreamInput`) — asserts `browser_source` (V1 parity) vs `ffmpeg_source` input kinds and their settings. CommonJS. |
| `useToast.test.ts` | Tests the `useToast` hook via `@testing-library/react` `renderHook` — add/remove/clear toasts and convenience methods; mocks `Math.random` for stable IDs. |

## For AI Agents

### Working In This Directory

- `obsClient.test.js` is CommonJS (`require`) because it tests CommonJS source; the rest are ESM TypeScript.
- These tests target pure functions and isolated I/O (temp dirs, in-memory DB). They do **not** require a live OBS instance — the OBS WebSocket client in `obsClient.js` itself is not exercised here.

### Testing Requirements

- Run with `npm test` (Jest). Tests use `@testing-library/react` for hooks and real `fs`/`sqlite3` for the write and schema tests.
- When changing `lib/database.ts` columns, update `database.test.ts` in the same change — it is the intentional drift gate.
- Preserve the `atomicWrite.test.ts` invariants (no leftover tmp files, cleanup on failure) when modifying `atomicWrite.ts`.

### Common Patterns

- `fs` operations are spied with `jest.spyOn(fs, ...)` and restored in `finally`/`afterEach`.
- Temp directories are created with `fs.mkdtempSync(...)` and torn down in `afterEach`.

## Dependencies

### Internal

- Imports the modules under test from `../` (`apiHelpers`, `atomicWrite`, `database`, `constants`, `streamInputConfig`, `useToast`).

### External

- `jest` (test runner), `@testing-library/react` (hook rendering), `sqlite3`/`sqlite`, Node `fs`/`os`/`path`.

<!-- MANUAL: notes below preserved on regeneration -->
