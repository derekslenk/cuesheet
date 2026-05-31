# Phase 1.4 — setActive Load Driver

Fires N setActive HTTP calls evenly spread across a fixed time window,
classifies each response, and reports p50 / p95 / p99 latency plus a
Phase 1.4 SLO verdict.

## What it does

1. `GET ${webuiUrl}/api/streams` to discover the live stream pool.
2. Builds a round-robin schedule over the (stream × screen) cross product.
3. Schedules `--calls` `POST /api/setActive` invocations evenly across the
   `--duration-ms` window (default: 100 calls across 60 000 ms → one
   start every ~600 ms; calls overlap in flight if any individual call
   takes longer than the interval).
4. For each response, classifies it into one of:
   - `ok` — 2xx
   - `validation` — 400 / 422
   - `db_lock` — body matches `database is locked` or `SQLITE_BUSY`
   - `http_error` — any other non-2xx
   - `network_error` — `fetch()` threw (ECONNREFUSED, DNS, etc.)
5. Records per-call HTTP latency.
6. Emits a console summary + a JSON report to disk; exits 0 if the
   Phase 1.4 SLO gate passes, 1 otherwise.

## Pass criteria (Phase 1.4 plan, §G1.4)

- `p95` HTTP latency ≤ 2000 ms warm
- Zero `database is locked` responses

(RSS growth and FD leaks are observed externally by the operator —
out of scope for this script.)

## Usage

```sh
npm run load:setactive -- --webui-url http://<obs-host>:3000
# or
npx tsx scripts/loadDriver.ts --calls 100 --duration-ms 60000
```

### Options

| Flag | Default | Description |
|---|---|---|
| `--webui-url <url>` | `http://127.0.0.1:3000` | Base webui URL |
| `--calls <n>` | `100` | Total setActive calls |
| `--duration-ms <ms>` | `60000` | Window across which to spread calls |
| `--screens <list>` | all 7 `SCREEN_POSITIONS` | Comma-separated screen names |
| `--output <path>` | `docs/phase-1.4-load-report.<ISO>.json` | JSON report destination |
| `--dry-run` | off | Fetch streams + print plan, do not fire calls |

### Exit codes

- `0` — Phase 1.4 SLO passes (p95 ≤ 2000 ms warm AND db_lock=0)
- `1` — SLO fails
- `2` — pre-flight error (webui unreachable, no streams, bad args)

## Operator runbook (PROD-HOST)

1. Phase 0.5.2 baseline must already be captured (see
   `docs/plugin-contract.md`).
2. OBS is running; Streamlink supervisor is up; the 7 hot streams are
   warm (run for ≥ 30 s before the test).
3. Pick a stable seat (the Mac dev box over Tailscale is fine — this
   driver does not touch OBS WebSocket).
4. Run:
   ```sh
   npm run load:setactive -- --webui-url http://<obs-host>:3000
   ```
5. Watch the console summary, then archive
   `docs/phase-1.4-load-report.<ISO>.json` to ops storage.
6. Cross-check the report against:
   - OBS process metrics scraper (Phase 3.2) — RSS growth < 500 MB/hr
   - `lsof -p $(pidof node)` — FD count returned to baseline
   - Streamlink supervisor `/health` — all 7 pipelines stayed green

## What it does NOT do

- It does not connect to OBS WebSocket. Click → program-change
  end-to-end latency is the Phase 4.2 dress-rehearsal gate; this script
  measures only the HTTP latency that setActive owns. Plugin-poll-side
  delay (up to 1000 ms per G2) is constant and additive.
- It does not run Streamlink. The "7 concurrent Streamlinks for 30 min"
  half of Phase 1.4 is operator-driven via the supervisor (`npm run
  supervisor`, see `scripts/streamlink-supervisor/`).
- It does not mutate or back up the database. Read-only against
  `/api/streams`; writes only happen via the production `setActive`
  code path.

## Files

- `loadDriver.ts` — CLI entry (thin)
- `loadDriver/stats.ts` — percentile math
- `loadDriver/schedule.ts` — evenly-spaced fire times
- `loadDriver/classifyResult.ts` — outcome bucketing (incl. db_lock detector)
- `loadDriver/picker.ts` — round-robin (stream × screen) picker
- `loadDriver/runDriver.ts` — orchestrator (deps-injected for testability)
- `loadDriver/reporter.ts` — console + SLO evaluation
