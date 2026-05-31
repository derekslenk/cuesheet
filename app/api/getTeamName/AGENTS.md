<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# getTeamName

## Purpose
`GET /api/getTeamName?team_id=<id>` returns `{ team_name }` for a single team. Pure DB read; 400 if `team_id` is missing, 404 if the team does not exist.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler wrapped in `withErrorHandling`. Reads `team_id` from the query string and `SELECT`s `team_name` from `TABLE_NAMES.TEAMS`. |

## For AI Agents
### Working In This Directory
- Responses use the shared `lib/apiHelpers` helpers (`createSuccessResponse`, `createErrorResponse`, `createDatabaseError`).

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/apiHelpers`.
### External
- `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
