<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# syncGroups

## Purpose
`POST /api/syncGroups` is a bulk reconciliation endpoint: it finds every team with `group_name IS NULL`, creates a matching OBS group named after the team, and writes the group name back to the DB. Returns a per-team success/failure summary.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Selects group-less teams from `TABLE_NAMES.TEAMS`, calls `createGroupIfNotExists(team_name)` per team, `UPDATE`s `group_name`, and accumulates `syncResults` with a success/failure count. |

## For AI Agents
### Working In This Directory
- Per-team OBS failures are caught and recorded in the result set; the loop continues.
- Unlike `createGroup`, this does not persist `group_uuid` (only `group_name`).
- `lib/obsClient` is loaded via `require(...)`.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/constants` (`TABLE_NAMES`), `lib/db` (`withDb`), `lib/obsClient` (`createGroupIfNotExists`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
