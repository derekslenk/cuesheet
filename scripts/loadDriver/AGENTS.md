<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# loadDriver

## Purpose

Phase 1.4 load driver for CueSheet's `setActive` endpoint. It discovers the live stream pool from `GET /api/streams`, builds a round-robin schedule over the (stream × screen) cross product, and fires N `POST /api/setActive` calls evenly spread across a fixed time window (default 100 calls over 60 000 ms ≈ one start every 600 ms; in-flight calls may overlap by design). Each response is classified, per-call HTTP latency is recorded, and the driver reports p50/p95/p99 plus a Phase 1.4 SLO verdict: p95 ≤ 2000 ms warm AND zero `database is locked` responses. It is read-only against OBS — it only drives the HTTP API (which writes the `${screen}.txt` files); the obs-source-switcher plugin performs the actual scene switch. The entry wrapper is `../loadDriver.ts` (npm `load:setactive`).

## Key Files

| File | Description |
|---|---|
| `runDriver.ts` | Core loop: schedules the fires, issues calls via an injectable `FetchFn`, collects latencies + buckets, and assembles a `DriverReport`. |
| `picker.ts` | `createPicker` — round-robin over `(streamId, screen)` pairs; `expectedGroupName` mirrors `app/api/setActive/route.ts` so the driver can predict what each call writes. |
| `schedule.ts` | `scheduleFireOffsets(count, durationMs)` — evenly-spaced fire offsets from 0 to just before `durationMs` (overlap permitted; validates positive inputs). |
| `classifyResult.ts` | `classifyResult` — buckets each outcome into `ok` / `validation` / `db_lock` / `http_error` / `network_error`; `db_lock` matches `database is locked` / `SQLITE_BUSY` (a dedicated bucket because the SLO forbids it). |
| `stats.ts` | `percentile` + `computeStats` — count/min/max/p50/p95/p99 over a latency sample array. |
| `reporter.ts` | `evaluateSLO` (p95 ≤ 2000 ms AND zero db locks) and `formatConsoleReport` — the pass/fail gate and human-readable summary. |
| `README.md` | What it does, the response buckets, and the Phase 1.4 §G1.4 pass criteria. |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `__tests__/` | Jest unit tests for picker, schedule, classifier, stats, reporter, and the driver loop (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- `db_lock` is deliberately separate from `http_error` because the SLO gate keys on it — don't fold it back into the generic bucket.
- `picker.expectedGroupName` is duplicated logic that must track `app/api/setActive/route.ts`; if the group-name derivation changes there, update it here.
- The loop takes an injected `FetchFn` and logger so it is fully unit-testable without a running webui.

### Testing Requirements

- Each module has a `*.test.ts` in `__tests__/`. Run via repo-root `npm test`.
- The SLO thresholds (p95 = 2000 ms, db_lock = 0) are asserted in `reporter.test.ts`.

### Common Patterns

- Injectable `FetchFn` + logger; deterministic offset scheduling; percentile-based reporting with an explicit exit-code gate (0 pass / 1 fail).

## Dependencies

### Internal

- Mirrors group-name derivation from `app/api/setActive/route.ts`; drives `/api/streams` and `/api/setActive`

### External

- `fetch` (injected in tests, global in the entry)

<!-- MANUAL: notes below preserved on regeneration -->
