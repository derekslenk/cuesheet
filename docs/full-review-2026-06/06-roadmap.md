# cuesheet — 6-Month Engineering Roadmap

**Context:** Post-review re-sequencing with **no event deadline** (next event ~6 months out, 2026-12). The original review's "P0 = before the event" framing is void; this plan re-ranks every finding by **engineering leverage and dependency depth**, not calendar urgency.

**How it was built:** 6 agents deep-scoped the foundational tracks against the real code, a sequencing pass produced the phase plan, and an adversarial critique (verdict: **minor-revisions**) caught 3 concrete fixes — **all applied below** (see *Corrections applied*). Source findings are in `.full-review/05-final-report.md`.

---

## Sequencing principle

1. **Foundational seams before riders.** The two keystones — a typed `obsClient` (`types/obsClient.d.ts` that deletes the route shims) and the `apiHelpers` convergence (gating + a response-shape guard) — are pure type/helper changes with near-zero runtime risk that unblock the most downstream work. They land first.
2. **Quick, low-risk wins first** for momentum and to retire genuinely-live bugs cheaply (Tailwind config drift, the DB-init race, the per-add OBS disconnect, the two pure-function test suites).
3. **The big refactor is a sustained spine, not a drop.** The `obsClient.js` extraction runs across Months 2–5, one behavior-preserving, **characterization-test-first** extraction at a time, so risk to the live create/teardown paths stays bounded.

**Critical path** (longest dependent chain, all in FOUND-1):
`P1 typed .d.ts → P2 connection extraction → P3 teardown char-test+move → P5 textSource → P7 createStreamGroupV2 → P8 .ts barrel`. Everything else parallelizes around this spine.

---

## The six tracks

| Track | Title | Closes (finding IDs) | Effort |
|-------|-------|----------------------|--------|
| **FOUND-1** | `obsClient.js` extraction, typing & DI (keystone) | F-H2, F-H3, A-H2, Q-H2, Q-H5, Q-M1, Q-M2, T-C3, D-M1, P-M1 | ~8 PRs / 2–3 wk |
| **FOUND-2** | API response-envelope convergence + contract | Q-H1, A-H1, D-H1, D-H2, F-H4, Q-H3, S-F3*, S-F5, S-F6, T-H1 | ~7 PRs / 1.5–2 wk |
| **FOUND-3** | Test backfill of security-critical + untested core | T-C1, T-C2, T-C3, T-H1, T-H3, T-H4, T-M1, T-M2, T-M3 | ~7–9 PRs / 2–3 wk |
| **FOUND-4** | Data layer & two-writer SQLite integrity | A-C1, S-F2, O-H1, P-H1, Q-M8, P-M2, P-M3, A-M3, Q-M5, Q-M6, D-C1, T-H2, T-M1 | ~8–10 PRs / 2–3 wk |
| **FOUND-5** | Performance & frontend modernization | P-C1, P-C2, P-H2, P-L3, P-H4, F-M3, P-M4, Q-M7, F-M1, F-M2, P-M6, P-M1 | ~6–7 PRs / ~2 wk |
| **FOUND-6** | CI/CD, build-config & docs hygiene | O-C1, O-H1(CI half), O-H2, F-H1, F-M5, O-M1–M5, O-L1/L3, D-C2, D-C3, D-H3, D-H4, D-M3, D-M4 | ~7 PRs / 1.5–2 wk |

\* S-F3 has **two halves** — input validation (owned here) and the streamlink `--` argument-separator (see *Corrections #3*).

---

## Phase plan

### Phase 1 — Quick wins + the two keystone seams · *Month 1*
**Goal:** retire the live/near-live bugs cheaply, pin the ~0% security-critical code, and land the two zero-runtime-risk foundations.

- **FOUND-6/P1** — Tailwind 4 CSS-first migration; delete the 4 inert/contradictory config files. *The one finding most likely mis-rendering today (F-H1)* — must be **browser-verified** (adding `@plugin "@tailwindcss/forms"` activates a form reset that has never applied).
- **FOUND-6/P2a** — **Windows** supervisor CI smoke (build+boot the `.exe` the host actually ships). *Moved up per critique — this is the #1 review finding (O-C1) and its build-half has no FOUND-4 dependency.*
- **FOUND-4/P1** — `getDatabase()` promise memoization (`dbPromise ??= openAndInit()`) — one-line kill of the check-then-await race (P-H1/Q-M8/T-M1). Lands with FOUND-3/P4's red test.
- **FOUND-5/P3** — delete the two `disconnectFromOBS()` calls in `addStream` (the only callers in `app/api`) — P-H2/P-L3, ~2-line diff.
- **FOUND-3/P1 + P2** — `middleware.test.ts` + `security.test.ts`: pure, instant suites pinning the auth/validation layer with blunt RED-FLAG test names (T-C1/T-C2).
- **FOUND-3/P3** — extend `twitch.test.js` for the batching/offline-null branches (T-H3/T-M3).
- **FOUND-1/P1** — `types/obsClient.d.ts` + delete the hand-rolled `OBSClient` shims from 6 routes (F-H3, half F-H2). Type-only, zero runtime.
- **FOUND-2/P1 + P2** — move `isDev()` gating into `createErrorResponse` (closes the S-F5 leak seam); add the `responseEnvelopeGuard` test cloned from `tableNameHardcodeGuard.test.ts`.
- **FOUND-4/P5** — wrap `seedLiveTestEvent` in a transaction (mirrors `cloneEvent`) — independent safe filler (Q-M6).

### Phase 2 — Data keystone + obsClient extraction begins + low-coupling API · *Month 2*
**Goal:** land the shared schema/PRAGMA keystone, start the obsClient extraction with its safety net, migrate the zero-client-coupling routes.

- **FOUND-4/P2** — `lib/dbSchema.ts` (pure DDL/PRAGMA strings, **no driver imports** so both runtimes consume it). The data-layer keystone.
- **FOUND-4/P3** — apply the canonical PRAGMA (`synchronous=NORMAL` + `wal_autocheckpoint`) to both openers (S-F2/P-M3).
- **FOUND-4/P4** — add indexes incl. **UNIQUE on `obs_source_name`** (enforces the dedup invariant) — with a pre-existing-duplicate detector before creating it.
- **FOUND-4/P7** — supervisor fail-loud schema preflight (`assertSchemaPresent`). *Independent of P2 — a plain `sqlite_master` query (critique #2).*
- **FOUND-1/P2** — extract the connection singleton → `lib/obs/connection.js` (re-exported) + race-guard test.
- **FOUND-1/P3** — write the **teardown-order characterization test first**, then move `deleteStreamComponents`/`deleteTeamComponents` → `lib/obs/teardown.js`. (This *is* FOUND-3/P7's gate.)
- **FOUND-2/P3** — migrate the 6 zero-coupling write routes (createGroup, syncGroups, verifyGroups, setScene, triggerTransition, obsPlaybackSettings).
- **FOUND-3/P4 + P5** — db-race acceptance test (red→green with FOUND-4/P1) + the OBS mutating-route suites.

### Phase 3 — obsClient correctness fixes + API mutations + boot-order preflight · *Month 3*
**Goal:** ship the two real obsClient defects (their char-tests now exist), migrate the flat-shape mutation routes, make boot order fail loud.

- **FOUND-1/P4** — make switcher-removal failure **fatal before `RemoveScene`** (Q-H5 — the code swallows the exact error its comment says crashes OBS).
- **FOUND-1/P5** — rebuild the nested-catch color-source ladder into the proven kind-fallback loop + tame bare catches (Q-H2/Q-M1); extract `lib/obs/textSource.js`.
- **FOUND-2/P4** — migrate the flat mutation routes (addStream, setActive, PUT/DELETE streams+teams); fix S-F3/T-H1 (reuse `validateStreamInput` in `PUT /streams/[id]`) + the Q-H3 `Number.isInteger` guard. **Also: the `--` streamlink separator** (critique #3).
- **FOUND-3/P6** — addStream rollback + PUT-validation tests (red→green acceptance for FOUND-2/P4).
- **FOUND-4/P8** — schema preflight in `cuesheet doctor` (shares `assertSchemaPresent`).
- **FOUND-6/P2b** — the **no-schema fail-loud CI assertion** (the half of O-C1 that depends on FOUND-4/P7/P8). Advisory until the preflight lands.

### Phase 4 — Frontend modernization + API read-routes + repository layer · *Month 4*
**Goal:** cut user-visible render cost, finish the client-coupled API migrations.

- **FOUND-5/P1** — invert the viewer-cache TTL (25s→45s, server > client poll) + cache the immutable `id→login` (P-C2/P-M6). **This substantially closes P-C1/P-C2 on its own.**
- **FOUND-5/P2 (trimmed)** — *only* the `getViewerCounts` coalescer, **and only if profiling after P1 shows a real first-poll thundering-herd**. The `?ids=` batch endpoint is **cut** (critique #2 — it would ship with no consumer; at ≤50 streams P1 leaves ~1.1 req/s).
- **FOUND-5/P4** — wire the existing `useSmartPolling` into the streams health poll (P-H4/F-M3).
- **FOUND-5/P5** — extract a memoized `<StreamRow>` + `useStreamControls` hook (P-M4/Q-M7).
- **FOUND-2/P5** — the careful client-coupled BARE-JSON read routes (GET streams/[id], obsStatus, getCurrentScene) — server+client edits together, heaviest browser verification.

### Phase 5 — Finish obsClient (riskiest PR) + React Actions + dead-code purge + docs · *Month 5*
**Goal:** land the largest obsClient extraction and the `.ts` conversion; adopt React 19 Actions; delete dead V1.

- **FOUND-1/P6** — resolve the `createTextSource` create-vs-update divergence (D-M1, confirmed real) + **delete the ~317-line dead `createStreamGroup` V1** (re-run the no-caller grep at merge).
- **FOUND-1/P7** — extract `createStreamGroupV2` (the live create path — single riskiest PR, keep isolated) + hoist `GetInputList` (P-M1).
- **FOUND-1/P8** — convert `lib/obs/*` to `.ts`, make `obsClient` a typed barrel (closes the rest of F-H2).
- **FOUND-5/P6 + P7** — `useActionState`/`useOptimistic` forms + memoized `<TeamRow>` (F-M1/F-M2).
- **FOUND-6/P4 + P5** — operator docs refresh (OBS_SETUP rewrite, env/security-posture reference, version strings, changelog) + fill every `TODO(operator)` in `RUNBOOK_FALLBACK.md` *(needs your real OBS hotkey bindings — owner fill-in, not agent-invented)*.

### Phase 6 — Lock-in: coverage ratchet, browser smoke, CI hygiene, docs cap · *Month 6*
**Goal:** convert gains into regression guards, add the one structurally-necessary browser smoke, finish hygiene.

- **FOUND-3/P7** — consolidate the obsClient DI characterization coverage (T-C3). *Thin consolidation over the tests authored in FOUND-1/P2-P3, not a re-authoring (critique #4) — don't double-count the effort.*
- **FOUND-3/P8** — the **one** Playwright overlay-render smoke (T-M2 — the only place jsdom is structurally insufficient). Advisory → promote after two green main runs; kept out of the jest path.
- **FOUND-3/P9** — scoped per-path coverage ratchet on `security.ts`/`middleware.ts` (don't touch the deliberately-inert global 70% gate).
- **FOUND-2/P6 + P7** — bless the deliberate exceptions (overlay/supervisor/preview) freezing the guard allowlist (use **Option A** — document the supervisor break-glass shape, don't rewrap it); rewrite `docs/API.md` to the converged reality (D-H1/D-H2). The empty TODO allowlist is the track's completion proof.
- **FOUND-6/P3, P6, P7** — advisory npm audit + secret scan into `ci-ok`; SHA-pin third-party actions + timeouts/concurrency/permissions + clean the ~700 MB `*.bun-build` litter; **demote `.forgejo` to an advisory mirror** (header comment + `upload-artifact` v3→v4) rather than chasing parity.
- **FOUND-4/P10** — document the two-writer/boot-order invariant (+ optional WAL checkpoint only if growth is observed).

---

## Quick wins (land in Month 1)

1. **FOUND-6/P1** Tailwind v4 CSS-first — fixes the one likely-live render bug (F-H1); cost is the browser verification.
2. **FOUND-6/P2a** Windows supervisor smoke — *the highest-value item in the whole review*; build-half ships standalone now.
3. **FOUND-4/P1** `getDatabase()` promise memoization — one-line race kill.
4. **FOUND-5/P3** delete the two `addStream` `disconnectFromOBS()` calls — ~2-line diff.
5. **FOUND-3/P1 + P2** `middleware.test.ts` + `security.test.ts` — pure, instant, pins the auth/validation layer.
6. **FOUND-1/P1** typed `obsClient.d.ts` + delete route shims — type-only, unblocks everything downstream.

## Biggest leverage (unblocks the most)

- **FOUND-1/P1** typed obsClient → unblocks FOUND-2 routes, FOUND-3 tests, FOUND-5 OBS work.
- **FOUND-2/P1+P2** isDev gating + envelope guard → makes the 25-route convergence safe and self-proving.
- **FOUND-4/P2** `dbSchema.ts` → gates PRAGMA parity, the UNIQUE index, event-script DDL dedup, and both schema preflights.
- **FOUND-1/P2+P3** connection extraction + teardown char-test → the safety net the whole spine leans on.
- **FOUND-4/P7** supervisor fail-loud preflight → turns a silent cold-host crash-loop into a clean exit; unblocks the FOUND-6/P2b CI gate.

## Defer / drop (explicit)

- **DROP** the `/api/overlay/viewers?ids=` batch endpoint — no consumer; P1's TTL inversion closes P-C1/P-C2 at ≤50 streams. Keep only the coalescer, profile-gated.
- **DEMOTE to backlog** FOUND-4/P9 (repository layer, A-M3) — largest data item, weakest value for a solo single-host tool, competes for the same route files as FOUND-1/FOUND-2; nothing depends on it. Do it only if it stops actively helping to *not* do it.
- **DEMOTE** `.forgejo` to an advisory mirror rather than full parity (self-hosted-runner Bun constraint = high effort, low value).
- **DROP** FOUND-2/P6 Option B (rewrapping the supervisor break-glass shape) — pure churn; document it as an exception instead.
- **DEFER** the optional periodic WAL-checkpoint timer — only if WAL growth is actually observed on a multi-day host.
- **Manual-only** (not automated): native `LABEL_RENDERER=obs` pixel/timing verification (measureTextWidth rasterization, color_source kind resolution) — jsdom/call-mocks can't cover rasterization, and `html` is the default so the cost is bounded.

---

## Corrections applied from the adversarial critique

1. **Split FOUND-6/P2 (Windows supervisor smoke).** The build+boot half (the #1 review finding, O-C1) was wrongly gated behind FOUND-4 and buried to Month 3 — it has *no* FOUND-4 dependency, so it moves to **Phase 1 (P2a)**. Only the no-schema fail-loud assertion (P2b) stays gated behind FOUND-4/P7 in Phase 3.
2. **Trimmed FOUND-5/P2.** Cut the consumer-less `?ids=` endpoint; keep only the coalescer, and only if post-P1 profiling shows a real thundering-herd. P-C1/P-C2 are substantially closed by P1 (TTL inversion) alone.
3. **Owned the dropped half of S-F3/T-H1.** The argument-injection mitigation — prepend `--` before the streamlink URL positional in the supervisor spawn wiring (`scripts/streamlink-supervisor/streamPipeline.ts`) — was unowned; it's now an explicit item in **FOUND-2/P4's** phase (Phase 3). (Bounded severity: no shell → no RCE; attacker must already be on the LAN.)
4. **Reconciled two ordering notes:** FOUND-4/P7 (preflight) is independent of P2 (`dbSchema.ts`) and can land in Phase 2; FOUND-3/P7 is a thin consolidation over FOUND-1/P2-P3's tests, not a re-authoring (don't double-count effort).
5. **Correctness note for the executor:** `require('obs-websocket-js')` resolves via the `exports` map to `dist/msgpack.cjs` (not `dist/json.cjs`) — immaterial to the type-only keystone (both `.d.ts` export the same `OBSRequestTypes`/`OBSResponseTypes` generics), but don't copy the imprecise claim into a code comment.

---

*Full per-step detail (summaries, file lists, test strategies, risks) for all 50 steps is in the workflow result; the phase plan above references each step by its `FOUND-n/Pn` id. The adversarial critique's verdict was **minor-revisions** — the load-bearing claims were verified against source and hold up; the corrections above are surgical, not structural.*
