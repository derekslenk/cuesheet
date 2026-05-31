<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# docs

## Purpose

Project documentation, operational runbooks, and measurement evidence for CueSheet. Covers the HTTP API surface, OBS setup, the contract with the upstream obs-source-switcher plugin, the SQLite schema, and the event-day operations playbooks for the 2026-06-13 stream-a-thon. Several `.json` files here are captured latency/atomic-write soak measurements referenced by the markdown docs.

## Key Files

| File | Description |
|------|-------------|
| `API.md` | Reference for the `/api/*` endpoints — auth (API key / `Authorization` header, localhost bypass in dev) and the standard `{success, data, message}` response envelope. |
| `OBS_SETUP.md` | OBS Studio configuration guide: prerequisites (obs-websocket, obs-source-switcher plugin) and the required **7** switcher source names (`ss_large` … `ss_bottom_right`) mapped to their `${screen}.txt` files. |
| `plugin-contract.md` | Baseline switcher latency measurements and the encoding contract for `${screen}.txt` (UTF-8, no BOM, no trailing newline). Includes the Phase 2.2 atomic-write decision and the Phase 4.2 SLO gate (p95 ≤ 2000 ms warm). |
| `schema.md` | SQLite schema notes — `streams_{year}_{season}_{suffix}` and `teams_{...}` columns/constraints, sourced from `lib/database.ts`. |
| `RUNBOOK_EVENT.md` | Primary event-day operations playbook (roles, T-60 setup, timeline, S1–S8 scenario quick-reference, rollback recipe, teardown, two-operator sign-off). |
| `RUNBOOK_FALLBACK.md` | Emergency/fallback procedures: file-write fallback, plugin-free operator mode (S8), BRB scene, RAM saturation (S1), corrupted-scene restore (S3), OBS host inaccessible (S7), rollback to last known-good. |
| `new_home.png` | Screenshot of the home page UI (referenced from docs/README). |
| `atomic-write-soak-mac.{write,rename}.json` | Mac atomic-write soak results (write-in-place vs temp+rename strategies). |
| `atomic-write-soak-win.{write,rename}.json` | Windows atomic-write soak results (Phase 2.2 F1). |
| `phase42-latency-baseline-win.json` | Phase 4.2 switcher latency baseline captured on the Windows prod OBS host. |

## Subdirectories

| Directory | Description |
|-----------|-------------|
| `atomic-write-soak-tmp/` | Temporary scratch output from soak runs. Not documented further; do **not** add an AGENTS.md inside it. |

## For AI Agents

### Working In This Directory

- `RUNBOOK_EVENT.md` is the primary playbook and links into `RUNBOOK_FALLBACK.md` for deep emergency steps — keep cross-references intact when editing either.
- `schema.md` cites specific line ranges in `lib/database.ts`; update it when the `CREATE TABLE` statements move or change.
- The `.json` soak/latency files are captured evidence, not config. Don't hand-edit them; regenerate from the soak/latency scripts if data needs refreshing.
- Frame all docs around CueSheet (this app). The obs-source-switcher plugin is an *external* dependency CueSheet drives — never describe it as this project.

### Testing Requirements

- None directly. `plugin-contract.md` / `schema.md` describe contracts that are enforced by tests in `lib/__tests__/`.

### Common Patterns

- Scenario codes (S1–S8) are shared vocabulary across both runbooks and the plugin/stream config comments in `lib/`.

## Dependencies

### Internal

- `schema.md` ↔ `lib/database.ts`, `lib/constants.ts`.
- `plugin-contract.md` ↔ `lib/atomicWrite.ts`, `files/${screen}.txt`.
- `API.md` ↔ `app/api/*` routes and `lib/apiHelpers.ts`.

### External

- obs-source-switcher plugin (latency/encoding contract), OBS Studio + obs-websocket (setup guide).

<!-- MANUAL: notes below preserved on regeneration -->
