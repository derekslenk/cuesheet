# Phase 1: Code Quality & Architecture Review

**Target:** Whole repo (`cuesheet`, ~27k LOC), depth-weighted on the recent `feat/html-stream-labels` work.

**Headline:** The freshest code (HTML stream-label subsystem + Twitch integration) is the **highest-quality** part of the codebase — small, pure, dependency-injected, well-commented, unit-tested. Technical debt is concentrated in the **older core**: `lib/obsClient.js` (1,404-line untyped god-module) and the **inconsistent API-route layer** (one good `apiHelpers` framework bypassed by ~19 of 24 routes). **No Critical correctness defects** found in code quality; one Critical *architectural* hazard (schema-ownership split between two DB drivers). A previously-claimed "Critical SQL injection" was verified and **rejected as a false positive**.

---

## Code Quality Findings (Phase 1A)

### Critical
None confirmed. Rejected: "SQL injection in `teams/[teamId]/route.ts:60-64`" — keys come from a hardcoded local literal (line 23), not user input; values parameterized. No vector.

### High
| ID | Finding | Location |
|----|---------|----------|
| Q-H1 | Three incompatible API response envelopes; `apiHelpers` bypassed by ~half of routes (maintainability, not Critical) | `app/api/**`, `lib/apiHelpers.ts:39-119` |
| Q-H2 | `obsClient.js` — two 250–320-line functions with nested, error-swallowing `.catch()` chains; innermost color-source fallback has no `.catch`, intermediates don't `return` | `lib/obsClient.js:290-325` |
| Q-H3 | Numeric route params parsed with bare `parseInt` (no radix/validation); NaN flows into WHERE. Correct pattern already exists in overlay routes | `teams/[teamId]/route.ts:14,91`, `streams/[id]/route.ts` |
| Q-H4 | Name-normalization helper `buildStreamGroupName()` bypassed by raw inlined idiom in 11 files | `lib/streamGroupName.ts` + 11 call sites |
| Q-H5 | Switcher-removal errors swallowed in the path the comment says crashes OBS; teardown proceeds to RemoveScene anyway | `lib/obsClient.js` `deleteStreamComponents` ~1074-1088 |

### Medium
- **Q-M1** Bare `catch` blocks throughout obsClient.js assume "already exists" (~408,563,587,810,911,1030).
- **Q-M2** Dead cleanup scaffolding — shared `_name_text` source never reclaimed (`obsClient.js` ~1155-1162).
- **Q-M3** `getViewerCounts` no per-batch try/catch — a transient 5xx on batch 2 discards batch-1 counts (`lib/twitch.ts:175-191`).
- **Q-M4** `getViewerCounts` conflates transient 5xx vs auth failures into the failure metric (`twitch.ts:157-192` + `viewers/route.ts:50-58`).
- **Q-M5** Event table DDL duplicated 3+ times (`setupTestEvent.ts:84-106`, `cloneEvent.ts:79-101`, `seedLiveTestEvent.ts:65-87`, canonical `database.ts:53-82`).
- **Q-M6** `seedLiveTestEvent.ts:88-113` seeds with no BEGIN/COMMIT (cloneEvent does it right) — non-atomic re-runs.
- **Q-M7** Mega React pages mixing concerns: `streams/page.tsx` (~805 lines), `teams/page.tsx` (~705); `@ts-expect-error` for `team_id:null` into a `number` field (streams/page.tsx:488).
- **Q-M8** `getDatabase()` singleton init not concurrency-guarded — concurrent first-hits double-open/leak (`database.ts:102-125`). Cache the promise.

### Low (grouped)
Magic numbers in obsClient.js; inconsistent log prefixes; CLI duplicated `SVC_LABELS` (3 files) + 3 near-identical status renderers; CLI `toPort()` silent fallback; CLI weak supervisor-JSON validation; streamdeck empty teardown catch; ErrorBoundary only console.errors; edit/[id] delete no in-flight guard; duplicated overlay `json()` helper across 3 routes; `twitchLoginFromUrl` regex caps at 30 (Twitch max 25).

---

## Architecture Findings (Phase 1B)

### Critical
| ID | Finding | Location |
|----|---------|----------|
| A-C1 | **Schema ownership split across two DB drivers, no shared DDL.** Node/sqlite3 webui owns `CREATE TABLE`+`ensureColumns`; Bun supervisor opens the same `sources.db` read-write and `UPDATE`s `disabled` but never creates/migrates tables — relies on undocumented webui-first boot order. PRAGMA already drifted (Bun `wal_autocheckpoint=1000` not in Node opener). | `lib/database.ts:50-100`, `streamlink-supervisor/bunDatabase.ts:15-29`, `runtime.ts:121-144` |

### High
| ID | Finding | Location |
|----|---------|----------|
| A-H1 | Three competing API response contracts across 24 routes (apiHelpers used by ~5); error contracts + status codes diverge (setActive 400 vs supervisor start 404 for same case). *Same root issue as Q-H1.* | `lib/apiHelpers.ts` + `app/api/**` |
| A-H2 | `obsClient.js` 1,404-line untyped god-module mixing 5 responsibilities; callers use drift-prone local `interface OBSClient` shims. *Same module as Q-H2/Q-H5.* | `lib/obsClient.js` |
| A-H3 | Brand palette duplicated in two formats (hex in `overlayData.ts:15-19`, ABGR in `labelLayout.js:82-83`), synced by comment only; byte-swap error-prone; renderers can silently diverge | `lib/overlayData.ts`, `lib/labelLayout.js` |

### Medium
- **A-M1** Multi-event isolation = lexical table-name suffixing in one shared DB; no cross-process `EVENT_KEY` agreement check — webui/supervisor with different keys silently use different tables (`constants.ts:27-64`).
- **A-M2** No authorization model; only LAN/localhost middleware bypass on a spoofable `Host` header; mutating routes as open as reads (accepted posture, `middleware.ts:1-41`).
- **A-M3** Three DB-access idioms coexist (`withDb` / raw `getDatabase()` / supervisor `MinimalDb`); addStream uses two in one file; no repository layer, SQL scattered.
- **A-M4** Overlay live-data: batched Twitch capability unused; per-label poll + two uncoordinated TTLs (25s server / 30s client).

### Low
- **A-L1** `overlayData.ts` is exemplary (contract/row/resolvers/validators) — positive; template for a repository extraction.
- **A-L2** `score` permanent-null placeholder in shipped contract.
- **A-L3** CJS/ESM mix (deliberate for jest) + `@/lib` vs relative import inconsistency.
- **A-L4** Overlay metrics process-local; operator must consult two health panels.

---

## Critical Issues for Phase 2 Context

These Phase-1 items most directly inform the Security & Performance review:

1. **A-C1 (schema-ownership/boot-order)** — a *correctness/reliability* hazard across the Node↔Bun process boundary; Phase 2 should assess data-integrity and concurrency risk (ties to Q-M8 db-init race and SQLite WAL/concurrent-writer behavior across two drivers).
2. **A-M2 / middleware auth model** — Phase 2 security must evaluate the unauthenticated control plane, the `API_KEY`-unset bypass, and the spoofable `Host`-header LAN bypass against the actual deployment threat model.
3. **`isSafeLogoPath` / `validateBrandingFields` / `ensureColumns` SAFE_IDENTIFIER whitelist** — Phase 2 should confirm the path-traversal and identifier-interpolation defenses hold (these are the write paths reachable from unauthenticated routes).
4. **Q-M3 / Q-M4 (Twitch batch failure + metric semantics)** and **A-M4 (per-label polling, no batching)** — Phase 2 performance should assess Helix rate-limit exposure, the viewer-cache TTLs, and N-label polling load.
5. **Q-H5 / Q-M2 (OBS teardown ordering + leaked sources)** — operational reliability under repeated add/delete cycles.
6. **Q-M7 (mega client pages with polling)** — Phase 2 frontend performance (re-renders, polling intervals, payload sizes).
