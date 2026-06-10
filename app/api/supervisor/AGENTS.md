<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-09 | Updated: 2026-06-09 -->

# api/supervisor

## Purpose
Web-side proxy to the always-on streamlink supervisor (loopback `http://127.0.0.1:8080`). One read route — `health` — and three mutating per-stream control routes — `streams/[id]/{start,stop,restart}`. The supervisor is the single control backend and owns the durable `disabled` write; these routes forward to it and, for start/stop, **break-glass** to a direct DB write only when the supervisor is unreachable. All HTTP calls go through `lib/supervisorClient`.

## Key Files
| File | Description |
| --- | --- |
| `health/route.ts` | `GET /api/supervisor/health`. Proxies the supervisor's `/health` snapshot for the streams page poll. Degrades gracefully: when unreachable it returns `{ reachable: false, status: 'unknown', streams: [] }` (HTTP 200) so the UI can fall back to the DB `disabled` flag. |
| `streams/[id]/start/route.ts` | `POST`. Resolves the numeric `id` → `obs_source_name` from `TABLE_NAMES.STREAMS`, then `requestSupervisorStart`. On a reachable 2xx returns `{success,id,action:'start'}`; on reachable-but-rejected returns 502; **break-glass** when unreachable: writes `disabled=0` and returns `{...,degraded:true}`. 404 for an unknown id. |
| `streams/[id]/stop/route.ts` | `POST`. Symmetric to start via `requestSupervisorStop` — break-glass writes `disabled=1`. |
| `streams/[id]/restart/route.ts` | `POST`. `requestSupervisorRestart` (in-place restart of a supervised stream). **No DB write** — restart only applies to a running/escalated stream. Returns `{success,id,action:'restart',restarted}`; `restarted:false` means the stream isn't supervised or the supervisor is unreachable (surfaced as a UI warning, not a hard error). |

## For AI Agents
### Working In This Directory
- **id → obs_source_name:** the web layer keys streams by numeric `id`; the supervisor keys on `obs_source_name`. Every mutating route resolves the name from the DB first and returns 404 if the row is missing — keep that lookup before any forward.
- **Forward-then-break-glass:** start/stop forward to the supervisor (the authoritative writer). Only when the client reports `reachable:false` do they write the DB themselves and flag `degraded`; the supervisor's next `/reload` reconcile absorbs that write. Do not write the DB on the happy path — that would double-apply and drift from the supervisor.
- **502 vs degraded:** reachable-but-rejected (`reachable:true, ok:false`) is a real 502 (do NOT break-glass — the supervisor saw the request and refused it). Only unreachable triggers the DB fallback.
- `params` is a `Promise` and must be awaited (Next.js 15 convention).
- **Trust boundary:** these routes have no auth and trust the loopback bind of both the web app and the supervisor (`127.0.0.1`). They mutate `sources.db` (start/stop) and trigger child-process control (restart) — do not expose them off-host without adding auth first.

### Testing Requirements
- `streams/[id]/__tests__/routes.test.ts` covers the stop route's 404 / forward / break-glass / 502 paths (mocks `lib/database` + `lib/supervisorClient`). Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/supervisorClient` (`fetchSupervisorHealth`, `requestSupervisorStart`, `requestSupervisorStop`, `requestSupervisorRestart`), `lib/database` (`getDatabase`), `lib/constants` (`TABLE_NAMES`).
### External
- `next/server`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
