# Phase 2: Security & Performance Review

**Target:** Whole repo (`cuesheet`). **Threat model (security):** single-operator LAN — in-scope adversaries are a co-network host, a malicious Twitch title/URL, and a hostile OBS browser source; internet exposure is out of scope by design. **Calibration (performance):** single broadcast host driving <50 streams, with notes where assumptions break at 50→100+.

**Headline:** Security posture is **strong** — no Critical or High vulnerabilities. The obvious sinks are correctly locked down (parameterized SQL, no shell anywhere, validated overlay XSS sinks, constrained Twitch URL parsing, redacted secrets). Residual risk is the **intentionally-open auth model** and **data-integrity hygiene** around the two-SQLite-writer split. Performance at the real scale (≤50 streams) is fine; the meaningful wins are **wiring the already-built Twitch viewer-batch path**, fixing the **DB-init race**, and **persisting the OBS connection** instead of reconnecting per mutation.

---

## Security Findings (Phase 2A)

> Severities are calibrated to the single-operator-LAN threat model (not inflated to internet-facing grades). A previously-claimed "Critical SQL injection" in `teams/[teamId]` was re-verified and **confirmed a false positive**.

### Critical
**None.**

### High
**None.**

### Medium
| ID | CWE | Finding | Location |
|----|-----|---------|----------|
| S-F1 | 290/348 | **Spoofable `Host`-header auth bypass + fail-open when `API_KEY` unset.** Middleware skips auth entirely if `API_KEY` unset (only warns); even when set, a client-controlled `Host: 192.168.x`/`localhost` bypasses the key. A co-network attacker can drive setActive/setScene/triggerTransition/addStream/DELETE streams/supervisor-stop. Exploitable by an in-scope co-network adversary; model collapses silently if host ever on a shared LAN. `middleware.ts` is **untested**. | `middleware.ts:16-25` |
| S-F2 | 665/662 | **Two SQLite writers, divergent durability + silent schema coupling (= A-C1).** Both run WAL (no corruption), but neither sets `synchronous` (per-connection; node-sqlite3 vs bun:sqlite defaults may differ) → power-loss can lose the last `disabled` flip. Supervisor runs zero DDL yet opens RW; if it touches a fresh DB before the webui it creates an empty schema and UPDATEs a missing table, masked by a broad catch. Medium (not Critical): webui-first in practice + busy_timeout=5000 = block-and-retry. | `database.ts:117-118`, `bunDatabase.ts:18-20`, `runtime.ts:121-144`, `streamSpecsLoader.ts:53-61` |
| S-F3 | 88/20 | **`PUT /streams/[id]` skips URL/team_id validation → streamlink argument injection.** Unlike `addStream`, PUT writes `url` after a truthiness check; supervisor pushes it as a positional streamlink arg, so a `--`-prefixed value is parsed as a flag. **No shell → no RCE/chaining**; impact confined to streamlink's flag surface via the trusted-LAN write path. | `streams/[id]/route.ts:44-75` → `commands.ts:30` |

### Low
- **S-F4** (CWE-770) Unauthenticated process-spawning routes (supervisor start/stop/restart, syncGroups, addStream) have no rate limit; only preview is capped (429).
- **S-F5** (CWE-209) `setActive:57-59` / `getActive:28` pass raw error `details` without an `isDev()` gate → leak absolute server paths in prod (other routes gate via `apiHelpers`).
- **S-F6** (CWE-200) `obsStatus` returns OBS host/port/version/scene names unauthenticated, no `isDev()` gate.
- **S-F7** (CWE-79, transitive) `npm audit --omit=dev`: 2 moderate — `postcss <8.5.10` XSS bundled in `next@16.2.9`'s **build** toolchain (not runtime). `fixAvailable` is a false signal (proposes `next@9.3.3` downgrade — do not). Direct deps clean. Track upstream Next patch.
- **S-F8** (CWE-20) `role`/`team_name`/`group_name`/`group_uuid` unbounded (validation covers only colors + logo_path). All flow to React-escaped JSX or `cleanObsName` (no XSS/shell). Apply a length cap.
- **S-F9** (Info) `STREAMS_TABLE` env reaches an interpolated SQL identifier but is re-guarded by an airtight whitelist on every use; operator-set env, not request input. Validate once at boot for fail-fast.

### Confirmed-safe (traced — recorded so they aren't re-litigated)
Command/shell injection **none** (all `spawn(cmd, argv)`, no `shell:true` in app code). Path traversal **none** (preview: `Number()` + anchored regex; setActive: enum-validated screen). SQL injection **none** (parameterized values; identifiers from constants/whitelists). Stored XSS **none** (React-escaped; `logoUrl` rejects `:`-schemes; colors hex-validated; no `dangerouslySetInnerHTML`). SSRF **none** (login `[A-Za-z0-9_]{1,30}`, `encodeURIComponent`, fixed Helix host). Secrets sound (gitignored; OBS pwd `***`; Twitch token redacted; **zero `NEXT_PUBLIC_*`**).

---

## Performance Findings (Phase 2B)

### Critical (at scale; High at <50)
| ID | Finding | Location |
|----|---------|----------|
| P-C1 | **Per-label viewer polling fans out to N Twitch calls every 30s; the batched `getViewerCounts` exists but is never called with >1 login (dead code).** N labels → N route invocations → ~N Helix calls/30s. ~2 req/s at 50, ~4 at 100. Each poll is also a CEF fetch+parse+render on the encoding host. | `StreamLabel.tsx:23,52-71`, `viewers/route.ts:52`, `twitch.ts:157-198` |
| P-C2 | **Two uncoordinated TTLs (25s server < 30s client) → a guaranteed cache miss almost every poll**, so the cache provides ~zero hit rate in the common one-label-per-channel case. | `twitch.ts:142`, `StreamLabel.tsx:23` |

*Fix C1+C2 together:* wire a shared batch endpoint (`/api/overlay/viewers?ids=...`) or a process-wide coalescing cache, and set the server TTL **longer** than the client poll (45–60s). Collapses N→⌈N/100⌉ Helix calls and restores a real hit rate.

### High
| ID | Finding | Location |
|----|---------|----------|
| P-H1 | **`getDatabase()` init not concurrency-guarded** → concurrent first-hits both `open()`, second leaks a connection (WAL read lock) + double `initializeDatabase` (= Q-M8). Cache the promise. | `database.ts:102-125` |
| P-H2 | **`addStream` connects *and disconnects* OBS per request**, tearing down the persistent singleton so every subsequent OBS op re-pays the connect+identify handshake. Plus `createStreamGroupV2` = 15–25 sequential calls (~2–4s/stream; native-label path adds up to 1.6s of `measureTextWidth` polling). | `addStream/route.ts:127,203,228`, `lib/obsClient.js` |
| P-H3 | **`addStream` is effectively a global lock during setup** (shared OBS socket + SQLite writer); importing 50 streams ≈ 100–200s sequential, with the 5s health poll + label polls layered on top. | `addStream`, `streams/page.tsx:384-388` |
| P-H4 | **Polling continues when the operator tab is hidden** — no `visibilitychange` gating; 5s health poll + 30s label polls run forever. Gate operator-UI intervals on `document.hidden` (leave the always-on OBS overlay labels). | `streams/page.tsx:384-388`, `StreamLabel.tsx:66` |

### Medium
- **P-M1** `GetInputList` re-fetched ~5× per create (and per-label during teardown) → O(N²) to build the event in **native**-label mode. Hoist the fetch; HTML renderer mostly sidesteps it.
- **P-M2** No indexes on `streams.team_id`, `streams.obs_source_name`, `teams.team_name` — full scans, but sub-ms at ≤50 rows (insurance). The UNIQUE index on `obs_source_name` would also enforce the dedup invariant.
- **P-M3** WAL checkpoint asymmetry (Node opener omits explicit `wal_autocheckpoint`; persistent reader can defer checkpoints). Set `wal_autocheckpoint` + `synchronous=NORMAL` explicitly; periodic `wal_checkpoint(TRUNCATE)`.
- **P-M4** Mega client pages re-render all rows per 5s poll (new `Map` identity; row tree not memoized). `React.memo` the row keyed by `(stream,status,pending)`; pass status as a primitive; skip the setState when unchanged.
- **P-M5** Supervisor `/streams` does a full-table read per hit (trivial at ≤50; the route the UI actually polls, `/supervisor/health`, is in-memory and cheap).
- **P-M6** Overlay `viewers` route does a `SELECT url WHERE id=?` every 30s/label to re-derive an **immutable** login. Cache `id→login` in a process-local Map.

### Low
- **P-L1** Process-local caches/metrics/singletons = horizontal-scaling barrier (by design; documented).
- **P-L2** `viewerCache` has no size cap/sweep (lazy TTL); bounded by distinct logins (≤N), not a practical leak.
- **P-L3** `disconnectFromOBS()` in the addStream error path can race the singleton for concurrent ops — fixing P-H2 removes it.
- **P-L4** Preview ffmpeg cap at 6 → 429 is a good, intentional bound (informational).
- **P-L5** `output: standalone` correct; overlay ships React into each CEF source (per-CEF RAM is the real ceiling — why video moved to `ffmpeg_source`).

**Do NOT change:** `OBS_BULK_PACE_MS` teardown pacing (prevents OBS crashes), the preview concurrency cap, and the in-memory single-host design. The `measureTextWidth` 8×-poll loop is only on the non-default OBS-native path — confirm the event runs `LABEL_RENDERER=html`.

---

## Critical Issues for Phase 3 Context (testing / documentation implications)

1. **`middleware.ts` is completely untested (S-F1).** Phase 3 must flag the missing auth characterization suite (fail-open path, `?apikey=` query param, Host bypass) — security-critical code with zero coverage. Any change to the auth model needs a pinning test first.
2. **Two-writer SQLite invariant (S-F2 / A-C1).** Tests should pin: identical PRAGMA on both openers (extend `database.wal.test.ts` to assert `synchronous`), and a supervisor "fail loud when table absent" test. Document the webui-first boot invariant.
3. **`PUT /streams/[id]` validation gap (S-F3).** Needs a test asserting `url`/`team_id` validation parity with `addStream` — currently the inconsistency is untested.
4. **Viewer batch/cache behavior (P-C1/P-C2).** The unused batch path and the TTL>poll relationship need tests once wired; document the intended TTL/poll contract so the 25s/30s mismatch can't silently return.
5. **OBS connection lifecycle (P-H2/P-L3).** Document that the OBS client is a persistent singleton and that per-request disconnect is an anti-pattern; the teardown-pacing and HTML-vs-native renderer behavior should be documented as deliberate.
6. **`LABEL_RENDERER=html` assumption** threads through both security (overlay XSS surface) and performance (native-path cost) — Phase 3/4 should confirm it is documented as the supported default in the runbook.
