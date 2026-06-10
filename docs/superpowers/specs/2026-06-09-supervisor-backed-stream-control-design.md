# Design: Supervisor-backed stream control (one backend, two views)

**Status:** revised after Architect + Critic review (2026-06-09) — awaiting user sign-off
**Supersedes the control-flow half of:** `.omc/plans/supervisor-stream-control-buttons.md`
(the `disabled` column, migration, `loadStreamSpecs` filter, and in-place
`restart` are already implemented in the WIP and are KEPT; the DB-write location,
the web API routes, and the supervisor's DB access mode change).

> **Review note (why v2):** independent Architect and Critic passes both
> converged on one blocking finding — the spec originally patched only
> `scripts/streamlink-supervisor/index.bun.ts`, but the binary actually shipped
> by `cuesheet start --which both` is `src/cli/commands/supervisor.bun.ts`
> (`src/cli/main.ts:63`), which also opens the DB read-only. v2 addresses that
> plus WAL/concurrency precision, a partial-failure contract, the bun type-shim
> gap, and testability of the acceptance criteria.

---

## Problem

The first iteration (branch `feat/stream-control-buttons`, tested + uncommitted)
put Start/Stop/Restart on the Next.js `/streams` page, with the **web layer**
writing the durable `disabled` flag. The user wants the controls primarily on the
**streamlink supervisor dashboard** (`:8080`) — where crash status / exit reasons
are visible and which is the **always-on** process.

The split exists because the compiled supervisor opens `sources.db`
**read-only**, so durable Stop/Start (a DB write) had to live in the web layer.

## Goals (confirmed)

1. **One thing to run** — already delivered by the unified `cuesheet` binary
   (`cuesheet start --which both`).
2. **One control backend** — the supervisor becomes the source of truth for
   stream lifecycle and the durable `disabled` flag (with a labeled break-glass
   exception, below).
3. **Simpler deploy** — the always-on supervisor owns control.

## Non-goals / hard constraints

- **No single merged process.** Streams MUST survive a web-UI restart/crash/
  redeploy → web UI and supervisor stay **two isolated processes**. (Next.js also
  can't be `bun --compile`'d.) Isolation holds because each process holds its own
  SQLite handle; closing the web's handle on restart doesn't affect the
  supervisor's child pipelines.
- Keep the `disabled` column, migration, `loadStreamSpecs` filter, and
  `supervisor.restart()` from the WIP.

## Key decisions (all confirmed)

| Decision | Choice |
|----------|--------|
| Control surface | **Both UIs, supervisor-backed** — dashboard + `/streams` both POST to the supervisor; supervisor owns the routine DB write |
| Supervisor DB access | **Read-write** via ONE shared helper imported by **both** bun entrypoints (`index.bun.ts` and `src/cli/commands/supervisor.bun.ts`) so they can't drift |
| Concurrency | **WAL** (set once, file property) + **`busy_timeout`** (set per connection on all openers) |
| Start/Stop mechanism | **Flip `disabled` + direct `supervisor.start(spec)` / `supervisor.stop(id)`**; `/reload` remains the reconcile authority and converges on the `disabled` filter |
| Supervisor down | **Break-glass fallback** — web first tries the supervisor; if unreachable, it writes `disabled` itself and the UI labels it "supervisor offline — applies on next reconcile" |
| Sequencing | **Single coherent commit** on the branch — no throwaway web-only checkpoint |

### On "single source of truth"

This is a **write discipline, not a DB-enforced invariant.** The web's
`getDatabase` stays read-write (it must, for add/delete streams), so nothing at
the DB level prevents a web `disabled` write. The routine path routes the write
through the supervisor; the **only** sanctioned web `disabled` write is the
labeled break-glass fallback when the supervisor is unreachable. Both paths
converge because `loadStreamSpecs` filters `disabled=0` (`streamSpecsLoader.ts:51`)
on every startup/reload, so `/reload` reconciles either writer's intent.

---

## Architecture

```
┌──────────────────┐   POST (Next route, server-side)   ┌───────────────────────────┐
│ Web /streams UI  │ ─────────────────────────────────▶ │ Supervisor process (:8080)│
│  (:3000)         │   ↳ supervisor unreachable?         │  ALWAYS-ON, owns lifecycle│
│  buttons         │     break-glass: web writes         │                           │
│                  │     `disabled` + labels it          │  • RW sources.db (WAL +   │
└──────────────────┘                                     │    busy_timeout)          │
┌──────────────────┐   POST (same origin, fetch)         │  • GET  /streams (merged) │
│ Supervisor       │ ─────────────────────────────────▶ │  • POST /streams/{id}/start│
│ dashboard(:8080) │                                     │  • POST /streams/{id}/stop │
│  buttons         │                                     │  • POST /streams/{id}/restart (done)
└──────────────────┘                                     │  • GET  /health (unchanged)│
                                                         └───────────────────────────┘
            Two isolated processes • one `cuesheet start` command
```

`{id}` in supervisor routes is **`streamId` == `obs_source_name`** (matching the
existing `/restart` route), NOT the numeric DB id. The web routes resolve
numeric id → `obs_source_name` before forwarding (as `restart/route.ts:18` already
does).

### Data flow — Stop (Start symmetric)

1. User clicks **Stop**.
2. **Dashboard:** same-origin `POST /streams/<obs_source_name>/stop`.
   **Web page:** `POST app/api/supervisor/streams/[id]/stop` → resolve
   `obs_source_name` from numeric id → forward via `supervisorClient`.
3. **Happy path** — supervisor `onStop(streamId)`: **write DB first**
   (`UPDATE <table> SET disabled=1 WHERE obs_source_name=?`), then
   `supervisor.stop(streamId)` (safe no-op if absent). 200 `{status:'ok'}`; 404
   if no row; **500 if the DB write throws** (mirrors `/reload`,
   `healthServer.ts:73-76`).
4. **Break-glass** — if the web route cannot reach the supervisor: web writes
   `disabled=1` via `getDatabase` and returns `{status:'ok', degraded:true}`; UI
   shows "supervisor offline — applies on next reconcile".
5. UIs re-poll and reflect the change.

**Partial-failure contract:** DB write is committed **before** the in-memory
supervisor action, and the durable `disabled` flag is **authoritative**. If
`supervisor.start()` throws after `disabled=0` is committed, the row says enabled
but nothing is supervised yet — the next `/reload` or supervisor restart heals it
(via the `disabled` filter). The HTTP layer returns 500 so the operator sees the
error; the flag state is already consistent.

### Start specifics

`onStart(streamId)`: `UPDATE ... SET disabled=0 WHERE obs_source_name=?`, then
load that one stream's spec and `supervisor.start(spec)`. `Supervisor.start()`
already guards double-start (returns existing state, `supervisor.ts:67-70`), so
re-clicking Start is safe. Neither direct-call nor `/reload` serializes a fast
Stop→Start on a reused `relayPort`; this is acceptable under operator pacing
(single local operator) and is unchanged from the existing reconcile behavior.

---

## Current state of the WIP (done / change / net-new)

| Area | Status |
|------|--------|
| `disabled` column in `CREATE TABLE` (`lib/database.ts:28`) | ✅ done |
| Migration `addDisabledToStreams.ts` + npm script (`package.json:20`) | ✅ done |
| `loadStreamSpecs` `disabled=0` filter + legacy fallback (`streamSpecsLoader.ts:36-51`) | ✅ done |
| `SAFE_TABLE_NAME` guard (`streamSpecsLoader.ts:25`) | ✅ done (reuse) |
| `supervisor.restart()` + `/restart` route + wiring | ✅ done + tested |
| Web routes write `disabled` + call `/reload` | 🔁 **change** → forward to supervisor (+ break-glass fallback) |
| `page.tsx` optimistic `disabled` write, `statusOf` DB fallback | 🔁 **change** → rely on poll; keep glyph badges |
| Supervisor DB access (both bun binaries) | 🔁 **change** → RW via shared helper |
| `onStart`/`onStop` + `GET /streams` (supervisor) | 🆕 net-new |
| `loadStreamSpec(streamId)` single-row | 🆕 net-new |
| Dashboard controls + colorblind glyphs | 🆕 net-new |
| `bun-shims.d.ts` `run()` | 🆕 net-new |

---

## Components & changes

### A. DB layer — read-write + WAL (the blocking fix)

- **Shared RW opener.** Create one helper (e.g.
  `scripts/streamlink-supervisor/bunDatabase.ts`) exporting
  `openBunDatabase(dbPath): MinimalDb` that opens `new BunDatabase(dbPath)` (RW),
  runs `PRAGMA journal_mode=WAL` (once; idempotent), `PRAGMA busy_timeout=5000`,
  and `PRAGMA wal_autocheckpoint=1000`, and implements both `all()` and `run()`.
  **Both** `scripts/streamlink-supervisor/index.bun.ts:56-65` **and**
  `src/cli/commands/supervisor.bun.ts:46-54` import it (replacing their separate
  read-only `openDatabase`). Update both file-header comments that assert
  "read-only / only ever reads".
- **bun:sqlite write API.** `bun:sqlite` `run` is **synchronous**
  (`db.run(sql, ...params)` / `db.query(sql).run(...)`); the adapter wraps it to
  satisfy `MinimalDb.run(): Promise<void>` (resolve immediately). Extend the type
  shim `src/cli/types/bun-shims.d.ts` `Statement`/`Database` with
  `run(...params: unknown[]): unknown` — without this the adapter won't type-check
  (and note tsc **excludes** the `.bun.ts` files, so a binary smoke test must
  exercise an actual write).
- **`lib/database.ts`** (`getDatabase`, sqlite3-npm, cached singleton
  `lib/database.ts:7,47-64`): set `journal_mode=WAL` + `busy_timeout=5000` on
  open. (`busy_timeout` is **per connection** — every opener sets it; WAL is a
  file property set once.)
- **`MinimalDb`** (`streamSpecsLoader.ts:4-6`): add
  `run(sql: string, ...params: unknown[]): Promise<void>`.
- **WAL locality + sidecars.** WAL is invalid on network/synced filesystems;
  `FILE_DIRECTORY` defaults to local `C:/OBS/source-switching` (`src/cli/lib/env.ts:29`)
  but is operator-overridable — document the local-fs requirement (and/or warn on
  open). Ensure `.gitignore` covers `*.db-wal` / `*.db-shm`.
- **Audit gate.** Confirm `scripts/auditSqliteOpens.ts` stays green after the
  `lib/database.ts` change (it matches `open({`; the new bun helper uses
  `new BunDatabase(` which the audit doesn't track — note this).

### B. Single-stream spec loader

- **`streamSpecsLoader.ts`**: extract `rowToSpec(row)` and add
  `loadStreamSpec(opts, streamId): Promise<StreamSpec | null>` (SELECT one row by
  `obs_source_name`, regardless of `disabled` since Start re-enables). Reuse the
  existing `SAFE_TABLE_NAME` guard.

### C. Supervisor HTTP — new routes

- **`healthServer.ts`**: extend `HealthRequestContext`/`StartHealthServerOptions`
  with `onStart?`/`onStop?: (streamId) => Promise<boolean>` and
  `listAll?: () => Promise<DashboardStream[]>`. Add routes mirroring `/restart`
  (`healthServer.ts:80-103`): method-guard 405, 501 when unwired, 200 on `true`,
  404 on `false`, **500 when the promise rejects** (like `onReload`):
  - `POST /streams/{id}/start`, `POST /streams/{id}/stop`, `GET /streams`.
  - Reuse the `[^/]+` path segment + `decodeURIComponent` (as `/restart` does,
    `healthServer.ts:93`); the streamId flows into a parameterized
    `WHERE obs_source_name=?` (injection-safe); only the **table name** is
    interpolated → must pass `SAFE_TABLE_NAME` (component D).
- **Snapshot shape:** `DashboardStream` widens beyond `HealthStreamSnapshot`
  (`healthServer.ts:3-8`) with `disabled`, `lastExitCode`, `lastExitSource`,
  `status: running|escalated|stopped`. Keep `GET /health` and its
  `HealthSnapshotProvider` **unchanged** (the web page still polls it via
  `/api/supervisor/health`); `GET /streams` is additive.

### D. Runtime wiring

- **`runtime.ts`** (`startRuntime`): build `onStart`/`onStop` closures over the
  RW `db` + `tableName` — **validate `tableName` against `SAFE_TABLE_NAME` here**
  before interpolating the UPDATE — write the flag then call
  `supervisor.start(spec)` / `supervisor.stop(id)`. Build `listAll` merging DB
  rows (key: `obs_source_name`) with `supervisor.list()`; a stopped row has no
  live port — derive its eventual port as `relayPort(row.id)`
  (`streamSpecsLoader.ts:56`). Pass all three into `startHealthServer` alongside
  the existing `onReload`/`onRestart`.

### E. Supervisor dashboard — controls + full list

`/health` lists only supervised streams (`healthServer.ts:116`), so a stopped
stream has no row to host **Start** → the DB-backed `GET /streams` provides the
full list.

- **`dashboard.html`**: source the table from `GET /streams` and render
  Start/Stop/Restart per row, enabled by status. **Keep `/health` for the 1s
  status pill**, but poll the heavier `GET /streams` **less often (every 2–3s)**
  to avoid a per-second full-table read on the always-on process (WAL keeps reads
  non-blocking, but frequency still matters). Confirm dialog on Stop/Restart.
- **Colorblind-safe (required — operator is colorblind, amber≈red):** the current
  dashboard uses color-only dots (`dashboard.html:94-106`). Add a non-color glyph
  + text (`● running` / `▲ crashed` / `■ stopped`), matching the web
  `STATUS_BADGE` (`page.tsx:38-46`) and the CRT theme's `.status-dot` shape cues.

### F. Web `/streams` — forward, with break-glass fallback

- **`lib/supervisorClient.ts`**: add `requestSupervisorStart(streamId)` /
  `requestSupervisorStop(streamId)` (mirror `requestSupervisorRestart`, returning
  a reachable/ok result).
- **`app/api/supervisor/streams/[id]/{start,stop}/route.ts`**: resolve
  `obs_source_name` from numeric id (DB read), forward to the supervisor. **If the
  supervisor is reachable**, do NOT write `disabled` in the web layer (supervisor
  owns it). **If unreachable (break-glass)**, write `disabled` via `getDatabase`
  and return `{status:'ok', degraded:true}`. Align `restart/route.ts` shape.
- **`app/streams/page.tsx`**: drop the optimistic `disabled` write; rely on the
  `/api/supervisor/health` poll for status; surface the `degraded` flag as a
  "supervisor offline" toast/label. Keep the confirm modal + glyph badges added
  this session. Revisit the `!supervisorReachable` → `stream.disabled` fallback
  (`page.tsx:63-71`) and the stale "fall back to DB disabled" comment in
  `app/api/supervisor/health/route.ts:7-8` so a briefly-unreachable supervisor
  doesn't show a running stream as "Stopped".

### G. Tests

- `streamSpecsLoader.test.ts`: `rowToSpec` + `loadStreamSpec` (found / not-found /
  disabled-still-loads-for-start).
- `healthServer.test.ts`: `/streams/{id}/start` + `/stop` (200/404/405/501 + **500
  on reject**); `GET /streams` shape; `/health` unchanged (regression guard).
- `runtime`: `onStart`/`onStop` validate table name, write expected SQL, call
  `supervisor.start/stop` (fake `MinimalDb` capturing `run`); `listAll` merge +
  stopped-row `relayPort`.
- **Web routes** (net-new tests): id→`obs_source_name` resolution; 404 unknown id;
  supervisor-reachable → no web `disabled` write; supervisor-unreachable →
  break-glass write + `degraded:true`.
- **Binary smoke** (tsc can't see `.bun.ts`): the built `cuesheet`
  (`binary:build:win`) and supervisor (`supervisor:build:win`) open `sources.db`
  RW and a write succeeds.
- WAL: assert `PRAGMA journal_mode` returns `wal` after open (integration). True
  multi-process contention is a **named soak step** modeled on
  `soak:atomic-write` (`package.json:39-40`) with explicit writer count + duration
  — not a unit test.

### H. Docs

- `scripts/streamlink-supervisor/README.md` + `AGENTS.md`: new endpoints, RW DB,
  WAL note, dashboard controls.
- `app/streams/AGENTS.md`: routes now forward (+ break-glass).
- New `app/api/supervisor/AGENTS.md` (mutating routes); `app/api/AGENTS.md` xref.
- `docs/schema.md`: `disabled` already documented.

---

## Acceptance criteria

1. **WAL/concurrency (split for testability):** (a) every opener sets
   `journal_mode=WAL` and `busy_timeout` — asserted by reading `PRAGMA
   journal_mode == 'wal'` after open; (b) a named soak step (N concurrent writers,
   fixed duration, modeled on `soak:atomic-write`) completes with zero
   `SQLITE_BUSY`/`database is locked`.
2. **Both bun binaries open RW.** `binary:build:win` (the `cuesheet` binary,
   `src/cli/commands/supervisor.bun.ts`) AND `supervisor:build:win`
   (`index.bun.ts`) open `sources.db` read-write and a `disabled` write succeeds
   (binary smoke).
3. `POST /streams/{id}/stop` → `disabled=1` AND the stream leaves
   `supervisor.list()`; `start` → `disabled=0` and it's supervised again; 404 on
   unknown `streamId`; 405 non-POST; **500 when the DB write rejects**.
4. `POST /streams/{id}/restart` still recovers an escalated stream (port
   unchanged, restartCount++) — unchanged from WIP.
5. `GET /streams` lists every DB stream merged with live status (incl. `stopped`),
   keyed on `obs_source_name`, with `listAll` validating `tableName` against
   `SAFE_TABLE_NAME`. `GET /health` shape is unchanged.
6. Dashboard shows all three controls per row, enabled by status, confirm on
   Stop/Restart, and each row is **readable without color** (a glyph token is
   present in the rendered markup, asserted as a string check).
7. **Web routes:** supervisor reachable → drive supervisor endpoints, **no** web
   `disabled` write; supervisor unreachable → **break-glass** web `disabled` write
   + `degraded:true` + UI "supervisor offline" label. Both covered by route tests.
8. Stop is durable across a supervisor restart (the `disabled` filter excludes it).
9. `npm run type-check`, `lint`, `test`, `build` pass; `binary:build:win` and
   `supervisor:build:win` compile; `auditSqliteOpens` stays green.

## Risks & mitigations

| Risk | Mitigation |
|------|-----------|
| **Second binary left read-only** → silent `SQLITE_READONLY` in production while CI is green | Shared `openBunDatabase` imported by BOTH bun entrypoints; AC2 binary smoke for both artifacts |
| **Two different SQLite libraries** (`sqlite3`-npm + `bun:sqlite`) on one WAL file | WAL + per-connection `busy_timeout`; tiny operator-paced writes; AC1 soak |
| WAL on network/synced `FILE_DIRECTORY` corrupts | Document local-fs requirement; default is local; optional open-time warning |
| `-wal` unbounded growth across long-lived handles | `wal_autocheckpoint=1000` on the RW openers |
| Partial-applied state (DB write ok, supervisor call throws) | DB write first + flag is authoritative; 500 surfaced; next `/reload`/restart heals via `disabled` filter |
| bun:sqlite `run()` not type-checked (`.bun.ts` excluded from tsc) | Extend `bun-shims.d.ts`; AC2 binary smoke exercises a real write |
| Dashboard per-second DB read | Keep 1s `/health` for the pill; poll `GET /streams` every 2–3s |
| New mutating endpoints, **no auth**, on a `127.0.0.1` socket | Accepted trust boundary (any local process / same-origin page can control streams); auth still deferred but now explicitly stated, not silently |
| "Single source of truth" is convention, not invariant (web stays RW) | Route routine writes through the supervisor; only break-glass writes from web; both converge via `disabled` filter |
| `streamId` vs numeric id confusion | Supervisor keys on `obs_source_name`; web resolves id→name before forwarding |

## Out of scope

- Auth on supervisor control endpoints (deferred; trust boundary stated above).
- Bulk start/stop-all; SSE/WebSocket push (keep polling).
- Merging into a single process (ruled out by isolation).

---
*Design artifact. No source changed by this document. Implementation proceeds
only after user review + an implementation plan (writing-plans).*
