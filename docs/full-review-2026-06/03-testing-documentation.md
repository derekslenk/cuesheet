# Phase 3: Testing & Documentation Review

**Target:** Whole repo (`cuesheet`).

**Headline:** The test *suite is healthy* — **609 tests across 77 suites, all passing in ~9s, zero flaky/skipped** (measured 2026-06-15). But coverage is **bimodal and the gate is not enforced**: the newest subsystems (overlay/stream-label, twitch, supervisor, streamdeck) are 90–100% covered with behavior+security assertions, while the **oldest, security-critical core is at ~0%** — `middleware.ts` (auth), `lib/security.ts` (input validation), `lib/obsClient.js` (1,400 lines of OBS choreography), and every mutating API route. Documentation is rich and the overlay docs are exemplary, but **three operator-facing gaps could cause an event-day failure** and the API docs describe one response envelope the code never adopted.

---

## Test Coverage Findings (Phase 3A)

**Measured:** `npx jest --coverage` → 77 suites / 609 tests / all pass / 9.0s. Global lines **31.79%** vs 70% configured. The 70% threshold is **decorative** — CI (`.github/workflows/build.yml:84-87`) runs plain `npm test`, not `test:ci`, by deliberate decision; only the supervisor sub-tree (~88%) is effectively defended.

### Critical (security-critical code at ~0% coverage)
| ID | Finding | Location |
|----|---------|----------|
| T-C1 | **`middleware.ts` auth completely untested** — the only auth layer; the fail-open (unset `API_KEY`), `?apikey=` query-key, and spoofable `Host: 192.168.*` bypass must be pinned by tests. Pure function — cheap to test. | `middleware.ts:1-41` |
| T-C2 | **`lib/security.ts` 0% coverage** — `validateStreamInput`/`isValidUrl`/`sanitizeString`/`validateScreenInput`/`validateInteger` are the front-line guards for every mutating write, with zero assertions. Pure functions. | `lib/security.ts:1-112` |
| T-C3 | **`lib/obsClient.js` (~1,400 lines) untested; `obsClient.test.js` is misnamed** (it tests `streamInputConfig.js`). Untested load-bearing logic: connection singleton race guard, `createStreamGroupV2` both renderer branches, and the **OBS-crash-avoidance deletion ordering** + `OBS_BULK_PACE_MS`. Finish the DI extraction and test the call sequence. | `lib/obsClient.js`, `lib/__tests__/obsClient.test.js` |

### High
- **T-H1** `PUT /api/streams/[id]` validation gap (S-F3) is real **and** untested — `streamsRole.test.ts` exercises PUT only with valid bodies; DELETE + 404/500 paths uncovered (28% lines). Fix the route to reuse `validateStreamInput`, then pin.
- **T-H2** Two-writer SQLite PRAGMA parity unpinned (A-C1/S-F2) — `database.wal.test.ts` covers only the Node opener and asserts `busy_timeout >= 1` (actual 5000); the Bun opener is never executed in CI. Extract PRAGMA to a shared constant + add a guard test (like `tableNameHardcodeGuard.test.ts`); add a "table absent fails loud" test at the `MinimalDb` DI seam.
- **T-H3** `getViewerCounts` batching (>100 logins) and **offline-null caching** (the anti-hammer mechanism) are untested though `twitch.ts` shows 100% lines — the batch path and the "don't re-query an offline login" branch have no behavioral assertion.
- **T-H4** **No test for `addStream` or any mutating OBS route** (`setActive`/`setScene`/`triggerTransition`/`syncGroups`/`verifyGroups` all 0%) — the operator's primary live-event actions, including `addStream`'s insert→OBS-build→rollback path. The mocking pattern already exists in `streamsRole.test.ts`.

### Medium
- **T-M1** db-init race (P-H1) unpinned — add a memoization test (`Promise.all([getDatabase(), getDatabase()])` → same handle); if it fails, the race is live.
- **T-M2** **No e2e/browser tests** (no Playwright/Cypress config). Deferring control-plane page e2e is reasonable, but the **OBS overlay render is where "renders in a browser" IS the requirement** — jsdom has no layout/paint, so a CSS/font/transparent-background regression ships green. Recommend **one Playwright smoke** against `/overlay/stream/[id]` (the repo already has playwright-core + chromium).
- **T-M3** Load/soak harnesses are hand-run scripts, not assertions (their pure pieces are ~100% covered — defensible). The genuine gap: no automated assertion of viewer-poll fan-out (M labels → ≤⌈M/100⌉ Helix calls/window). Overlaps T-H3.

### Low / fine-as-is
Partial coverage on `supervisorClient` (57%) / `teams/[teamId]` (42%) with critical paths at 100%; non-event-critical files (`performance.ts`, `apiClient.ts`, several components) at 0%; **mock hygiene is good** (DI, env restore, `resetModules`, real-fs cleanup — low flake risk); **test quality is high where tests exist** (the gaps are absence, not weakness).

---

## Documentation Findings (Phase 3B)

### Critical (operator-facing, can cause event-day failure)
| ID | Finding | Location |
|----|---------|----------|
| D-C1 | **Webui-before-supervisor boot order undocumented in every operator runbook.** The compiled supervisor only `SELECT`s — schema creation lives solely in the webui (`lib/database.ts:50-100`). A cold start with the supervisor first fails `no such table`. Documented only in `streamlink-supervisor/README.md:90-95` (not read at boot). dev `tsx` entry masks it → production-binary-only surprise. | `docs/RUNBOOK_EVENT.md`, `README.md` |
| D-C2 | **No canonical env-var reference in the event runbook; security posture unstated.** `RUNBOOK_EVENT.md` has zero mentions of `API_KEY`/`EVENT_KEY`/`LABEL_RENDERER`/Twitch creds or `loopback`/`firewall`/`bind`. The middleware fail-open + LAN/Host bypass (S-F1) means the intended posture (bind loopback / firewall the host) must be written down. | `docs/RUNBOOK_EVENT.md`, `middleware.ts:16-23` |
| D-C3 | **`docs/OBS_SETUP.md:57-62` is stale** — describes legacy 1600×900 browser-source video, but the default now creates an `ffmpeg_source` Media Source + a separate transparent HTML label browser source. The event-day setup guide describes neither. | `docs/OBS_SETUP.md:57-62` |

### High (accuracy bugs + missing contract)
- **D-H1** No canonical API response-envelope spec — `docs/API.md` documents one shape; the 25 routes ship **five**. Concrete contradictions: `getCurrentScene` (`data.currentScene` doc vs `data.sceneName` code), `obsStatus` (wrapped doc vs bare code), and the documented error shape matches neither `apiHelpers` nor most routes. *(Same root as Q-H1/A-H1.)*
- **D-H2** 10 of 25 routes are absent from `API.md` (all overlay + supervisor proxy routes, plus `counts`/`obsPlaybackSettings`/`preview`) — yet README calls it the "Complete REST API reference."
- **D-H3** Stale framework versions — README badge + prose and `AGENTS.md` say "Next.js 15"; the repo ships Next 16 / React 19.2 / TS 6 / Node 22.
- **D-H4** No changelog/migration guide for the Next/React/sqlite3 dep upgrade or the browser→media-source conversion (the OBS-native→HTML label migration *is* adequately covered in the runbook).

### Medium
- **D-M1** `obsClient.js` inline docs are bimodal — newer regions exemplary; older V1 half has unexplained magic numbers and a **divergent `createTextSource` create-vs-update settings** pair (`outline_size` 2 vs 4; update adds `bk_color`/`bk_opacity`) that "looks like a latent bug" and warrants a code look, not just a comment.
- **D-M2** Stream-labels runbook is **accurate** against code (spot-checked); optionally note the 25s/30s TTL relationship as intentional.
- **D-M3** README mixes native-text and HTML descriptions of the *default* label — clarify HTML is default, native-text is the `LABEL_RENDERER=obs` legacy path.
- **D-M4** ~15 `package.json` scripts undocumented (mostly dev/CI harnesses — acceptable; the event-relevant ones are covered).

### Low
API.md "Rate Limiting: none" is honest; `AGENTS.md` header date/version stale (= D-H3); verify the Geist font is actually bundled; `monitor/` correctly flagged deprecated; fold D-C1/D-C2 additions into the existing substantial runbooks rather than new files.

---

## Notable strengths
- **Test suite is fast, deterministic, and green** (609/609 in 9s) with genuinely good behavior+security assertions in the covered areas (CSS-injection/path-traversal rejection, graceful degradation, `no-store` headers, 404-vs-5xx distinction).
- **Overlay subsystem documentation** (`stream-labels-runbook.md`, `overlay-label-design.md`, and the inline docs in `overlayData.ts`/`twitch.ts`/`overlayMetrics.ts`/`streamLabel.js`) is exemplary and accurate against the code.
- **Per-directory `AGENTS.md` fan-out** (~50 files) is internally consistent — a real strength for agent-assisted work.

*(Phase 4 will assess framework/language best practices and CI/CD; the untested-auth + missing-changelog + non-enforced-coverage-gate findings feed directly into the CI/CD and standards review.)*
