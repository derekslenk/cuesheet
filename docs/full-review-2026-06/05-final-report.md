# Comprehensive Code Review Report — `cuesheet`

**Review date:** 2026-06-14 → 2026-06-15 · **Branch:** `feat/html-stream-labels` · **Scope:** whole repo / working tree (~27k LOC)

## Review Target

The whole `cuesheet` repository — a Next.js 16 (App Router) + React 19 + TypeScript 6 single-host LAN control plane for orchestrating multi-stream live events: OBS WebSocket scene control, a Bun-compiled streamlink-supervisor sidecar, Stream Deck XL hardware control, HTML browser-source overlays, Twitch live-data, and a Bun-compiled CLI/TUI. Reviewed across five phases (Code Quality, Architecture, Security, Performance, Testing, Documentation, Framework/Language Standards, CI/CD & DevOps) by specialized agents, with all findings re-verified against source.

## Executive Summary

**This is a mature, well-engineered codebase for a single-operator event tool, and the newest work (`feat/html-stream-labels`) is the highest-quality code in it** — pure, dependency-injected, well-documented, and 90–100% test-covered. The test suite is green and fast (**609 tests / 77 suites / ~9s, zero flaky**). There are **no security Critical/High vulnerabilities and no data-loss/correctness defects** — the dangerous sinks (shell, SQL, path, XSS, SSRF, secrets) are genuinely locked down, and a previously-claimed "Critical SQL injection" was re-verified as a **false positive**.

The real risk is concentrated in three places, none of which is a live correctness bug but each of which is worth addressing before the system is relied on for another event:
1. **A CI gate that can't catch a broken event-day binary** — the blocking supervisor smoke builds/boots the *Linux* binary while the host ships the *Windows* cross-compile (O-C1).
2. **A silent, unenforced webui-before-supervisor boot order** — two SQLite drivers share one DB; only the webui owns the schema (A-C1), and nothing in code, CI, or the runbook enforces the ordering.
3. **A Tailwind 4 misconfiguration that is likely mis-rendering the UI right now** — the config files are silently inert, so `@tailwindcss/forms` and the theme never load (F-H1).

The remaining debt lives in the **older core** (`lib/obsClient.js` — a 1,404-line untyped god-module — and the **inconsistent API response envelopes** across 24 routes) and in **coverage gaps on security-critical-but-old code** (`middleware.ts` auth and `lib/security.ts` validation are at ~0%). The highest-leverage fixes are small and well-scoped.

> **Severity calibration:** All findings are scored for a single-operator, network-isolated LAN deployment driving <50 streams. Internet-facing severities are deliberately not inflated. "Critical (at scale)" performance items are High at the real ≤50-stream load.

---

## Findings by Priority

### P0 — Critical (address before the next event / before relying on the system again)

> No live security-Critical or data-loss defects were found. The P0 items below are an operational-stability gap, an architectural hazard, and a likely-active rendering bug.

**P0-1 — CI supervisor smoke validates the wrong-OS binary** *(Phase 4 O-C1)*
`.github/workflows/build.yml` runs the blocking `supervisor-binary` job on `ubuntu-latest`, smoking the host-native **Linux ELF** (`scripts/smokeSupervisorBinary.mjs:50` → `supervisor:build`). The artifact deployed to the OBS host is the **Windows** `--target=bun-windows-x64` binary, which is **never built or booted in CI**. A Windows-only Bun compile/boot failure passes `ci-ok` green and reaches event day undetected — exactly the failure the smoke was promoted-to-blocking to prevent.
→ *Fix:* run the supervisor smoke on `windows-latest` building `supervisor:build:win`; add an assertion that booting against an empty `FILE_DIRECTORY` (no schema) fails fast and loud (gate-enforces A-C1).

**P0-2 — Schema-ownership split + unenforced boot order** *(Phase 1 A-C1; Phase 2 S-F2; Phase 3 D-C1/T-H2; Phase 4 O-H1)*
Two SQLite drivers write the same `sources.db`: the Node/sqlite3 webui owns all DDL (`lib/database.ts:50-100`), while the Bun/bun:sqlite supervisor (`bunDatabase.ts`) opens it read-write and `UPDATE`s `disabled` with **zero schema logic**. The webui-first boot order is undocumented, untested, and unenforced; on a cold host where the supervisor starts first, it creates an empty DB and crash-loops under NSSM. Security re-scoped the *data* risk down (both run WAL → no corruption; `busy_timeout=5000` → block-and-retry), leaving the real residuals: a **durability-PRAGMA gap** (neither sets `synchronous`) and **silent failure** instead of a loud one.
→ *Fix:* identical PRAGMA on both openers (`synchronous=NORMAL` + `wal_autocheckpoint`); supervisor/`doctor` schema preflight that exits clean+loud when the table is absent; document the boot order in `RUNBOOK_EVENT.md`; pin PRAGMA parity with a test.

**P0-3 — Tailwind 4 configs are silently inert (likely mis-rendering today)** *(Phase 4 F-H1)*
The repo runs Tailwind 4 but `globals.css` uses v3 `@tailwind` directives and there is no `@config` directive, so **neither `tailwind.config.js` nor `tailwind.config.ts` is loaded**. `@tailwindcss/forms`, `darkMode: 'class'`, and the theme colors are all dead, and the two config files contradict each other. This is the one finding most likely to be a *visible* bug now.
→ *Fix:* migrate to v4 CSS-first (`@import "tailwindcss"; @plugin "@tailwindcss/forms"; @theme {…}`), delete both config files, and **verify the UI in a browser** (forms styling will change once the plugin actually loads).

### P1 — High (fix before next release)

**P1-1 — Inconsistent API response envelopes across 24 routes** *(Q-H1 / A-H1 / D-H1 / F-H4 — one finding, four phases)*
A good `apiHelpers` framework (`withErrorHandling`, `createSuccessResponse`, `isDev`-gated errors) exists but is used by only ~5 routes; the rest hand-roll 3–5 incompatible shapes with diverging error contracts and status codes (e.g. `setActive` 400 vs `supervisor/start` 404 for the same case). `docs/API.md` documents one envelope the code never adopted, and 10/25 routes are undocumented. Every client must special-case each route.
→ *Fix:* route all control-plane handlers through `apiHelpers`; formally bless the overlay `{ok}` and `preview` (binary) contracts as documented exceptions; add a response-shape guard test; fix the 3 concrete doc contradictions.

**P1-2 — `lib/obsClient.js`: 1,404-line untyped god-module** *(Q-H2/Q-H5/A-H2/F-H2/F-H3/T-C3/D-M1 — one cluster)*
The single largest debt concentration. It mixes 5 responsibilities, is plain untyped CJS (the "ESM-only, can't require under jest" justification is **factually wrong** — obs-websocket-js@5 is dual-published), is **never type-checked** (`allowJs` w/o `checkJs`), forces ~5 routes to hand-roll drift-prone `interface OBSClient` shims that erase the real v5 generic types, contains a nested error-swallowing `.catch()` ladder (`:290-325`) and a switcher-removal path that swallows the very error its comment says **crashes OBS** (`:1074-1088`), and is **~0% tested** (the `obsClient.test.js` file actually tests a different module).
→ *Fix (post-event, staged):* continue the extraction pattern `streamLabel.js` already models — pure DI orchestration taking `{call}`, testable against a mock; convert to `.ts`; delete the shims; **first** test = assert teardown detaches from switchers before `RemoveScene`; **first** correctness fix = make switcher-removal failure fatal.

**P1-3 — Viewer-polling fan-out: built-but-unwired batching + inverted cache TTL** *(Q-M3/Q-M4/A-M4/P-C1/P-C2/T-H3 — one cluster)*
Each overlay label polls Twitch independently every 30s; the batched `getViewerCounts` that would collapse N calls into ⌈N/100⌉ is **dead code**, and the server cache TTL (25s) is *shorter* than the client poll (30s), guaranteeing a cache miss almost every poll → ~zero hit rate. Works today (correctness is fine), wasteful and scales linearly with label count.
→ *Fix:* wire a shared batch endpoint or a coalescing cache; set server TTL (45–60s) > client poll; add a fan-out + offline-null-caching test; cache the immutable `id→login` to drop the per-poll DB read.

**P1-4 — DB-init race in `getDatabase()`** *(Q-M8 / P-H1 / T-M1)*
`getDatabase()` does check-then-`await open()`-then-assign on a module singleton; concurrent first-hits (plausible at boot when several polled routes fire at once) both `open()`, leaking a connection (WAL read lock) and double-running init.
→ *Fix:* cache the in-flight **promise** (`dbPromise ??= openAndInit()`, reset on failure). One-line, kills the race; pin with a memoization test.

**P1-5 — `addStream` disconnects OBS per request** *(P-H2 / P-L3)*
`addStream` calls `disconnectFromOBS()` after every add, tearing down the persistent singleton so every subsequent OBS op re-pays the connect+identify handshake (and creates a concurrency hazard for in-flight ops).
→ *Fix:* stop disconnecting per request; let the singleton persist. Confirm `LABEL_RENDERER=html` (skips the ~1.6s `measureTextWidth` native-label polling).

**P1-6 — Security-critical-but-old code at ~0% coverage** *(T-C1 / T-C2)*
`middleware.ts` (the only auth layer — fail-open when `API_KEY` unset, `?apikey=` query key, spoofable `Host: 192.168.*` bypass) and `lib/security.ts` (every write-path validator) have **zero tests**, despite both being pure and trivially testable. Any refactor can silently change the auth posture.
→ *Fix:* add `middleware.test.ts` pinning the fail-open/query-key/Host-bypass behaviors (so the risk is visible in test names) and `security.test.ts` for `isValidUrl`/`sanitizeString`/`validateStreamInput`.

**P1-7 — Operator-facing documentation gaps that can cause event-day failure** *(D-C2 / D-C3 / O-H2 / O-M4)*
No canonical env-var reference and no stated security posture in the event runbook (D-C2); `docs/OBS_SETUP.md` is stale — it describes legacy 1600×900 browser sources, not the current media-source + HTML-label pipeline (D-C3); `RUNBOOK_FALLBACK.md` ships `TODO(operator)` placeholders in the emergency hotkey table, including the load-bearing BRB binding (O-M4); and CI has no supply-chain/secret scanning to backstop the live creds in `.env.local` (O-H2).
→ *Fix:* add an env/security-posture reference; refresh OBS_SETUP; fill every fallback-runbook TODO (doors-don't-open gate); add an advisory `npm audit`/secret-scan job to `ci-ok`.

**P1-8 — Unvalidated `PUT /api/streams/[id]`** *(S-F3 / T-H1)*
Unlike `addStream`, the PUT handler skips `isValidUrl`/`team_id` validation; a `--`-prefixed `url` reaches streamlink as a CLI flag (no shell → no RCE, but a real argument-injection inconsistency on an attacker-reachable LAN route), and it's untested.
→ *Fix:* reuse `validateStreamInput`; prepend `--` before the streamlink URL positional; add the validation tests.

### P2 — Medium (plan for an upcoming sprint)

- **Polling/UI cost:** no `visibilitychange` gating on operator-tab polls though the repo already has `useSmartPolling` (P-H4/F-M3); mega-pages re-render all rows every 5s with no memoization (Q-M7/P-M4/F-M1/F-M2); React pages predate React 19 Actions/`useOptimistic` (F-M1).
- **Duplication:** `buildStreamGroupName()` bypassed in 11 files (Q-H4); event-table DDL copy-pasted 3+ times (Q-M5); brand palette duplicated in two formats synced by comment only (A-H3); triple-duplicated supervisor bootstrap (F-M4).
- **Data layer:** three coexisting DB-access idioms / no repository layer (A-M3); missing indexes incl. a UNIQUE on `obs_source_name` that would enforce the dedup invariant (P-M2); WAL checkpoint asymmetry (P-M3); non-atomic seed in `seedLiveTestEvent.ts` (Q-M6).
- **OBS internals:** bare/empty catch blocks (Q-M1); leaked shared text source (Q-M2); `GetInputList` re-fetched O(N²) in native-label mode (P-M1); divergent `createTextSource` create-vs-update settings that "look like a latent bug" — warrants a code look (D-M1).
- **Config/CI hygiene:** two conflicting PostCSS configs (F-M5); CI actions on mutable tags not SHAs (O-M1); `.forgejo` mirror drifted + EOL `upload-artifact@v3` (O-M2); no `timeout-minutes`/`concurrency` (O-M3); stale `release/` tree + ~700 MB litter (O-M5).
- **Security hardening (Low-Medium):** no rate limit on process-spawning routes (S-F4); raw error `details` leak server paths outside dev (S-F5); `obsStatus` exposes host/port unauthenticated (S-F6); unbounded string fields (S-F8).
- **Testing:** no e2e/browser smoke for the OBS overlay render — the one place "renders in a browser" *is* the requirement (T-M2); no automated viewer fan-out assertion (T-M3).

### P3 — Low (track in backlog)

Magic numbers + inconsistent log prefixes in `obsClient.js`; CLI duplicated `SVC_LABELS` + status renderers; `ErrorBoundary` only `console.error`s; duplicated overlay `json()` helper; `score` permanent-null placeholder in the overlay contract; CJS/ESM + import-alias inconsistency; `@ts-expect-error` at `streams/page.tsx:488` (curable); `target: ES2017` stale for Node 22; bare `http`/`fs` vs `node:` specifiers; unused `ws` top-level dep; native `confirm()`/`prompt()` vs modals; deprecated `substr`; dead `withPerformanceMonitoring` HOC; npm-audit 2 moderate (build-time postcss, do **not** take the `next@9` "fix"); stale "Next.js 15" version strings in README/AGENTS (D-H3); no changelog/migration guide (D-H4); per-job CI `permissions` hardening (O-L3); non-blocking coverage trend (O-L1).

---

## Findings by Category

*(Counts are post-dedup across phases; many "High" items appeared in 2–4 phases and are counted once. C = Critical, H = High, M = Medium, L = Low.)*

- **Code Quality:** ~23 — 0C / 4H / 8M / ~11L
- **Architecture:** ~12 — 1C / 3H / 4M / 4L
- **Security:** 9 — 0C / 0H / 3M / 5L + 1 info
- **Performance:** ~17 — 2C(at-scale) / 4H / 6M / 5L
- **Testing:** ~10 — 3C(0%-cov security/OBS code) / 4H / 3M / fine-elsewhere
- **Documentation:** ~14 — 3C(operator) / 4H / 4M / 3L
- **Framework/Language:** ~15 — 0C / 4H / 5M / 6L
- **CI/CD & DevOps:** ~14 — 1C / 2H / 5M / 4L + strengths

**Net unique cross-phase themes:** API-envelope inconsistency (×4 phases), `obsClient.js` debt (×4), schema/boot-order (×4), viewer-polling (×3), middleware auth (×3), DB-init race (×3), mega-page polling/memoization (×3).

---

## Recommended Action Plan

**Before the next event (P0 + event-day P1s) — small, high-leverage:**
1. **O-C1** — make the supervisor CI smoke build+boot the **Windows** binary, with a no-schema fail-loud assertion. *(M effort)*
2. **A-C1** — identical PRAGMA on both SQLite openers + supervisor/`doctor` schema preflight + document the webui-first boot order in the runbook. *(S–M)*
3. **F-H1** — fix the Tailwind 4 config and **visually verify** the UI renders. *(S, but verify carefully)*
4. **P1-7 docs** — fill the `RUNBOOK_FALLBACK.md` TODOs, add the env/security-posture reference, refresh `OBS_SETUP.md`; bind Next to loopback / firewall :3000. *(S)*
5. **P1-4 / P1-5** — cache the DB-init promise; stop disconnecting OBS per add. *(S each)*

**Next release (remaining P1s) — mechanical, high payoff:**
6. **P1-1** — converge all routes on `apiHelpers`; add a shape-guard test; fix the API docs.
7. **P1-3** — wire the Twitch batch path + invert the TTL relationship + tests.
8. **P1-6 / P1-8** — add `middleware.test.ts` + `security.test.ts`; validate `PUT /streams/[id]` and test it.
9. **O-H2** — add advisory `npm audit` + secret-scan to `ci-ok`; install Renovate post-event.

**Upcoming sprint (P2) — group related work:**
10. Duplication sweep: route name-building through `buildStreamGroupName`, share the event-table DDL, single-source the brand palette, extract `bootSupervisor()`.
11. Data layer: add the indexes (esp. UNIQUE `obs_source_name`), align WAL settings, extract a small repository layer.
12. **P1-2 obsClient extraction** (multi-session): stage the DI/`.ts` migration, starting with the teardown-order test and the switcher-removal-fatal fix.
13. Frontend: `useSmartPolling` for the health poll, memoized rows, then opportunistic React-19 Actions.
14. CI hygiene: SHA-pin actions, `timeout-minutes`/`concurrency`, `.forgejo` parity-or-demote, clean `release/`.

**Backlog (P3):** the Low list above, as cleanup-of-opportunity.

**Explicitly do NOT change** (verified as deliberate and correct): the `OBS_BULK_PACE_MS` teardown pacing (prevents OBS crashes), the preview ffmpeg concurrency cap, the in-memory single-host design of caches/metrics, the raw `<img>` in the CEF overlay (next/image is unwanted there), and the intentionally-unenforced 70% coverage gate.

---

## Review Metadata

- **Phases completed:** 1 (Code Quality + Architecture), 2 (Security + Performance), 3 (Testing + Documentation), 4 (Framework/Language + CI/CD), 5 (this report).
- **Method:** 8 specialized agents (2 per phase) running against the live repo, each reading and citing source; cross-phase findings de-duplicated and severities re-calibrated to the single-host LAN threat model. The test suite was executed (609 tests pass) and `npm audit` was run.
- **Flags applied:** none (`--security-focus`/`--performance-critical`/`--strict-mode` not set).
- **Notable correction:** a prior-claimed "Critical SQL injection" in `teams/[teamId]/route.ts` was re-verified and **rejected as a false positive** (column names are hardcoded literals; values are parameterized).
- **Raw per-agent outputs:** `.full-review/_phase{1a,1b,2a,2b,3a,3b,4a,4b}-raw.md`. Consolidated per-phase reports: `.full-review/0{1,2,3,4}-*.md`.
