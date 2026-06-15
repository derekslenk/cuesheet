# Phase 2B (raw) — Performance & Scalability Analysis

**Calibration:** Single broadcast host, <50 streams. Notes where assumptions break at 50→100+.

**Headline:** For 10–50 streams the system is broadly fine (SQLite on one host, dozens of rows, not query-bound; missing indexes immaterial). Real perf characteristics dominated by: (1) per-label client polling fan-out to Twitch+DB (unused batch path is the built-but-unwired fix), (2) long sequential OBS WebSocket call-chains during create/teardown (deliberately paced — correct, but dominant latency), (3) process-local in-memory state (caches, metrics, OBS singleton, supervisor map) — correct for one host, hard ceiling on horizontal scaling.

## CRITICAL (at scale)
**C1 — Per-label viewer polling fans out to N Twitch calls/30s; batch path exists but unused.** StreamLabel.tsx:23,52-71 (VIEWERS_POLL_MS=30000), viewers/route.ts:52 (getViewerCount single-login), twitch.ts:157-198 (batched getViewerCounts unused). N labels = N route invocations/30s = ~N Helix calls/25-30s (each login's cache populated by its own poll, not shared batching). N=50 → ~2 req/s; N=100 → ~4 req/s (Helix budget ~13/s so no limit hit at 50 but burns budget linearly). Each poll also a CEF source doing fetch+parse+React update on the encoding machine. Fix: server-side aggregator labels share — batch endpoint `/api/overlay/viewers?ids=...` (page knows all ids) OR process-wide coalescing cache (queueMicrotask batches concurrent single-login lookups into one Helix call). Smallest change wires existing batching without touching client.

**C2 — Two uncoordinated TTLs (25s server / 30s client) guarantee a cache miss ~every poll.** twitch.ts:142 (VIEWER_TTL_MS=25000) < StreamLabel.tsx:23 (30000). By next poll the entry always expired (30>25) → every client poll is a guaranteed miss → fresh Helix call. Cache only helps when multiple labels of same channel poll within 25s (rare). Fix: server TTL strictly LONGER than client poll (e.g. 45-60s) → every other poll hits cache, halves Helix even without batching.

## HIGH
**H1 — getDatabase() init not concurrency-guarded → connection leak + double init (database.ts:102-125, confirms Q-M8).** db assigned only after first await open(); two requests before first open() resolves both open(), second overwrites+leaks first (file handle + WAL read lock), initializeDatabase runs twice. Plausible at boot when polled routes fire simultaneously. Fix: cache the promise not the handle (dbPromise ??= ...; .catch resets for retry).

**H2 — addStream connects+disconnects OBS WebSocket every add, serializing round-trips behind handshake (addStream/route.ts:127,203,228).** obsClient maintains a singleton designed to persist (ensureConnected) but disconnectFromOBS() at end of every add tears it down → next op pays full connect+identify again. createStreamGroupV2 is 15-25 sequential await obsClient.call(); native-label path includes two measureTextWidth loops polling GetSceneItemTransform up to 8× with 100ms sleeps = up to 1.6s pure polling. One stream ≈ 2-4s wall-clock. Fix: stop disconnecting after each add (persist singleton); confirm event runs LABEL_RENDERER=html (skips native chrome + measureTextWidth); parallelize independent switcher updates. **DO NOT parallelize OBS_BULK_PACE_MS teardown pacing (prevents OBS crash).**

**H3 — addStream effectively a global lock during event; concurrent adds + 5s health poll + label polls contend on one OBS socket + one SQLite writer.** Importing 50 streams ≈ 100-200s sequential. Fix: pause/back off 5s health poll while mutation in flight or tab hidden; bulk-add endpoint holding OBS connection open + reusing GetInputList.

**H4 — Polling continues when tab hidden; no visibilitychange gating.** streams/page.tsx:384-388 (5s unconditional), StreamLabel.tsx:66 (30s). Background operator tab = 12 req/min indefinitely. Fix: gate operator-UI intervals on document.hidden + refresh on focus. Leave OBS overlay labels (genuinely always-on) — they get C1/C2 instead.

## MEDIUM
- **M1** GetInputList re-fetched repeatedly within one create (createStreamGroupV2:822 + each ensureStreamLabelInput:739 ×3 + ensureTeamLabelText:718). At 50 streams×6 inputs native = ~300 inputs, ~5 full scans per add → O(N) per add → O(N²) to build event in native mode. deleteStreamComponents re-fetches per label (obsClient.js:1144). Fix: fetch once, pass set down; hoist out of loops. HTML renderer sidesteps.
- **M2** No indexes on streams.team_id, streams.obs_source_name, teams.team_name (zero CREATE INDEX in repo). Hot full scans: addStream dedup WHERE obs_source_name (98), supervisor loadStreamSpec on every control action (streamSpecsLoader.ts:81), team delete WHERE team_id, team-name LOWER() check. Sub-ms at 50 rows — insurance only. Fix: CREATE INDEX IF NOT EXISTS idx_streams_team, UNIQUE idx_streams_obs_source (also enforces dedup invariant against 335/336 double-row bug), idx_teams_name_nocase.
- **M3** WAL checkpoint asymmetry — Node opener omits wal_autocheckpoint (inherits default 1000, so effective match); persistent singleton reader can prevent full checkpoint → WAL growth (stays small at this write volume). Fix: set wal_autocheckpoint + synchronous=NORMAL explicitly in Node opener; periodic PRAGMA wal_checkpoint(TRUNCATE) on timer/shutdown.
- **M4** Mega client pages re-render everything per poll, no row memoization/virtualization. streams/page.tsx setStatusBySource(new Map) every 5s → new identity → StreamsByTeam re-renders all N rows (statusOf, STATUS_BADGE, ~10 SVG buttons each). streamsByTeam grouping correctly useMemo'd (good) but row tree (186-296) not. Fix: React.memo StreamRow keyed by (stream,status,pending); pass status as primitive; setStatusBySource(prev=>mapsEqual?prev:next); factor inline SVGs into icon components.
- **M5** Supervisor listAll/loadStreamRows full-table read per /streams hit; trivial at 50. /api/supervisor/health (what streams page polls) = supervisor.list() in-memory, already cheap. Optional 1-2s cache if dashboard polls /streams.
- **M6** force-dynamic overlay routes do fresh DB round-trip per label; viewers route does SELECT url WHERE id=? every 30s/label to re-derive an immutable login. Fix: cache id→login in process-local Map → 30s poll skips DB. Combined with C1/C2 removes DB read + most Helix from steady-state.

## LOW
- **L1** In-memory caches/metrics/singletons process-local → horizontal-scaling barrier (by design, acknowledged overlayMetrics.ts:7-9). viewerCache bounded by N logins, tiny — not a leak. Document single-host assumption.
- **L2** viewerCache no size cap/sweep (lazy TTL on read); bounded by distinct logins ≤N, kilobytes. Optional LRU.
- **L3** disconnectFromOBS() in addStream error path can race singleton for concurrent ops (obsClient.js:118 nulls obs). Fixing H2 removes it.
- **L4** Preview ceiling 6 concurrent ffmpeg → 429 (good bound, -c copy remux, 20s reaper). Informational.
- **L5** output:standalone correct; overlay ships React into each CEF source; shared/cached bundle, per-CEF RAM is the real ceiling (why video moved to ffmpeg_source per OOM-fix comment addStream:119-121).

## Scalability table (10→50→100)
- Helix calls/30s: ~10 → ~50(2/s) → ~100(4/s); limiter C1/C2.
- Add wall-time (HTML labels): ~1-2s ea serialized; ~100-200s to build 50; limiter H2/H3.
- Add (native labels): O(N²) input scans (M1) — avoid native, use HTML default.
- DB queries: trivial at all realistic counts; M2 indexes insurance.
- UI re-render: mild→noticeable waste/5s; M4 + H4.
- Memory: per-CEF RAM ceiling.
- Horizontal scaling: hard wall (L1), single-host by design.

SPOFs: OBS WebSocket singleton, one sources.db writer pair, supervisor process (in-memory map, restart re-reads DB — designed).

## Top 5 actions
1. C1+C2 (wire batch + TTL>poll) — highest impact, code exists.
2. H1 (cache init promise) — tiny diff, kills race.
3. H2 (stop per-add disconnect) — removes handshake per mutation, fixes L3.
4. H4 (gate polling on document.hidden) — trivial.
5. M2 (3 CREATE INDEX, esp UNIQUE obs_source_name) — additive, hardens dedup.

**Do NOT change:** OBS_BULK_PACE_MS teardown pacing (prevents crash), preview concurrency cap, in-memory single-host design. measureTextWidth 8×-poll only on non-default native path — confirm LABEL_RENDERER=html.
