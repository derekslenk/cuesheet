<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# counts

## Purpose
`GET /api/counts` returns the row counts of the streams and teams tables as `{ streams, teams }`. Pure DB read, no OBS interaction. Used for dashboard summary figures.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler wrapped in `withErrorHandling`. Runs two `SELECT COUNT(*)` queries against `TABLE_NAMES.STREAMS` and `TABLE_NAMES.TEAMS` in parallel via `Promise.all`. |

## For AI Agents
### Working In This Directory
- Returns via `createSuccessResponse`; DB errors funnel through `createDatabaseError`.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/apiHelpers`.
### External
- `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
