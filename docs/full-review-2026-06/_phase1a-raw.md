# Phase 1A (raw) — Code Quality Review

# CueSheet Code Quality Review

**Scope:** Whole repo (~27k LOC), depth-weighted on the recent `feat/html-stream-labels` work (`lib/streamLabel.js`, `lib/overlayData.ts`, `lib/overlayMetrics.ts`, `lib/twitch.ts`, `lib/liveSeed.ts`, `lib/database.ts`, the overlay route group, `app/api/overlay/**`, and the event setup/clone/switch scripts).

**Headline:** The freshest code (the HTML stream-label subsystem) is, by a wide margin, the highest-quality code in the repo — small, pure, dependency-injected, well-commented, and unit-tested. The technical debt is concentrated in the older core: `lib/obsClient.js` and the inconsistent API-route layer. No Critical correctness defects in the reviewed code. One agent-reported "Critical SQL injection" is a false positive (corrected).

## Critical
*None confirmed.* Two agent-surfaced "Critical" items verified and downgraded/rejected:
- REJECTED — "SQL injection via dynamic column names" in `app/api/teams/[teamId]/route.ts:60-64`. The loop iterates `Object.entries(brandingFields)` where `brandingFields` is a hardcoded local literal (line 23). Keys are compile-time constants, never user input; values are parameterized. No injection vector. (Genuine smaller issue: unvalidated parseInt — High #3.)
- DOWNGRADED — "Inconsistent response envelope." Real/systemic but maintainability, not Critical. See High #1.

## High
- **H1. Three incompatible API response envelopes; `apiHelpers` bypassed by ~half the routes.** `lib/apiHelpers.ts:39-119` provides a clean framework (createSuccessResponse/createErrorResponse/withErrorHandling, isDev-aware). Envelopes: A (apiHelpers `{success,data,timestamp}`), B (hand-rolled `{message}`/`{error}`, e.g. `teams/[teamId]/route.ts:78,81`), C (overlay local `json()` `{ok:true}`, `overlay/[id]/route.ts:16-21` — intentional/documented). Fix: standardize on A via withErrorHandling for non-overlay handlers; keep overlay C with cross-ref comment.
- **H2. `lib/obsClient.js` — two giant functions with nested, error-swallowing `.catch()` chains.** `createStreamGroup()` (~317 lines) and `createStreamGroupV2()` (~264 lines). Concrete: `obsClient.js:290-325` three-level nested `.catch()` ladder for color_source_v3→v2→v1 fallback; innermost failure (314-323) has no `.catch`, intermediate handlers don't `return`. Fix: linear fallback loop recording/rethrowing last error; extract setupObsNativeLabels/setupHtmlLabels/createNestedSceneItem helpers.
- **H3. Numeric route params parsed with bare `parseInt` (no radix, no validation).** `teams/[teamId]/route.ts:14,91`; `streams/[id]/route.ts`. `parseInt('abc')`→NaN flows into WHERE. The new overlay routes do it correctly (`overlay/[id]/route.ts:43-46`: Number + Number.isInteger && >0 → 404). Apply uniformly.
- **H4. Name-normalization abstraction bypassed in 11 files.** `lib/streamGroupName.ts` exports `buildStreamGroupName()` but raw `.toLowerCase().replace(/\s+/g,'_')` is inlined in 11 files (teams/[teamId]:125-127, addStream, setActive, verifyGroups, streams/[id]). `streamGroupName.ts:4` carries a "keep in sync" comment. Route all call sites through the helper.
- **H5. Switcher-removal errors swallowed in the load-bearing path.** `lib/obsClient.js` deleteStreamComponents (~1074-1088). Comment says removing a `_stream` scene while a switcher references it crashes OBS, then removal is in a try/catch that only console.logs and proceeds to RemoveScene. Make switcher-removal failure fatal for teardown (rethrow/abort RemoveScene).

## Medium
- **M1.** Empty/bare catch blocks throughout obsClient.js (~408,563,587,810,911,1030) — capture error, branch on "already exists", rethrow else.
- **M2.** Dead/incomplete cleanup scaffolding in deleteStreamComponents (~1155-1162) — shared `_name_text` source never reclaimed. Implement last-stream check or delete vestigial block + document.
- **M3.** `getViewerCounts` partial-failure can lose a whole poll — `lib/twitch.ts:175-191` batching loop has no per-batch try/catch; a transient 5xx on batch 2 discards batch-1 counts.
- **M4.** `getViewerCounts` conflates transient 5xx vs auth failures into the failure metric — `lib/twitch.ts:157-192` + `viewers/route.ts:50-58`. Distinguish before counting.
- **M5.** Event scripts duplicate full table DDL 3+ times — `setupTestEvent.ts:84-106`, `cloneEvent.ts:79-101`, `seedLiveTestEvent.ts:65-87`, canonical `database.ts:53-82`. Export shared `createEventTables()`.
- **M6.** `seedLiveTestEvent.ts:88-113` resets sqlite_sequence + bulk-inserts with no BEGIN/COMMIT (cloneEvent.ts:113-163 does it right). Wrap seed in a transaction.
- **M7.** Large React pages mixing concerns — `streams/page.tsx` (~805 lines), `teams/page.tsx` (~705 lines). `streams/page.tsx:488` uses `@ts-expect-error` for `team_id:null` into a number field (model should be `number|null`). Extract hooks, lift state to context, split subtrees.
- **M8.** `getDatabase()` singleton init not concurrency-guarded — `database.ts:102-125` checks `if(!db)` then awaits open(); two concurrent first-hits both open(), leaking a connection + double-init. Cache the promise: `dbPromise ??= openAndInit()`.

## Low (grouped)
L1 magic numbers in obsClient.js (1920/1080, font 96, ABGR literals). L2 inconsistent log prefixes. L3 CLI duplicated SVC_LABELS map (gui.ts:49/status.ts:96/watch.ts:21) + 3 near-identical status renderers. L4 CLI toPort() silent fallback (start.ts:259-262). L5 CLI weak runtime validation of supervisor JSON (health.ts probe `as StreamStatus[]`). L6 streamdeck empty catch on teardown (index.ts:54-62). L7 ErrorBoundary only console.errors (ErrorBoundary.tsx:26). L8 edit/[id] delete no in-flight guard. L9 duplicated overlay json()/JSON_HEADERS across 3 overlay routes. L10 twitchLoginFromUrl regex caps login at 30 (Twitch max 25).

## What's notably good
streamLabel.js / overlayData.ts / overlayMetrics.ts / twitch.ts / liveSeed.ts — DI, pure, well-commented, env-tunable with clamping, fail-loud (refuses undefined streamId rather than baking /overlay/stream/undefined). overlayData validation (isHexColor, isSafeLogoPath rejecting `..`/scheme, validateBrandingFields) unit-tested. Overlay routes validate ids before DB, distinguish 404-stale vs 500, set Cache-Control:no-store, feed health panel. StreamLabel.test.tsx covers ready/offline/404/500/role. database.ts ensureColumns guards interpolated identifiers behind SAFE_IDENTIFIER whitelist with fail-fast.

## Suggested remediation order
1. H2+H5+M1 (obsClient OBS-crash-adjacent risk). 2. H1+H3 (API layer). 3. H4+M5 (duplication). 4. M8 (db race) + M7 (split mega-pages). 5. Low cleanup.
