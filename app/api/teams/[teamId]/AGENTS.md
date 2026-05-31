<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# teams/[teamId]

## Purpose
Per-team mutations on the dynamic route `/api/teams/[teamId]`. `PUT` updates any combination of `team_name`/`group_name`/`group_uuid` (dynamic `UPDATE` built from supplied fields). `DELETE` removes the team and all its streams: it first cleans up each stream's OBS components and switcher text files, then deletes the team's OBS components, then deletes streams + team inside a SQL transaction.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `PUT` and `DELETE` handlers (`await params` for Next.js 15). `DELETE` loops `deleteStreamComponents` + `clearTextFilesForStream` per stream, calls `deleteTeamComponents`, then runs `BEGIN`/`COMMIT`/`ROLLBACK` around the cascade delete on `TABLE_NAMES.STREAMS`/`TEAMS`. |

## For AI Agents
### Working In This Directory
- DB deletes are wrapped in an explicit transaction with rollback on error; OBS cleanup runs before the transaction and is best-effort (logged, non-blocking).
- `params` is a `Promise` and must be awaited (Next.js 15 convention).

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/obsClient` (`deleteTeamComponents`, `deleteStreamComponents`, `clearTextFilesForStream`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
