<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# teams

## Purpose
Team collection endpoints. `GET /api/teams` lists all teams (`team_id`, `team_name`, `group_name`, `group_uuid`) ordered by name. `POST /api/teams` creates a team after validating the name (2–50 chars, unique case-insensitively); if `create_obs_group` is set it also creates an OBS group and a `<team>_text` text source, persisting the group name/UUID. Per-team update/delete live in the `[teamId]` subdirectory.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` and `POST` handlers (both via `withErrorHandling`). Inline `validateTeamInput`; OBS work uses `createGroupIfNotExists` + `createTextSource`. Reads/writes `TABLE_NAMES.TEAMS`. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `[teamId]` | Single-team PUT/DELETE with cascade OBS + stream cleanup (see `[teamId]/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- OBS group/text-source creation on POST is best-effort: failures are logged and the team is still inserted (with null group fields).
- Duplicate names are rejected with `createValidationError`.

### Testing Requirements
- `app/api/__tests__/teams.test.ts` mocks `lib/database`, `lib/apiHelpers`, and `lib/obsClient`. Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/apiHelpers`, `lib/obsClient` (`createGroupIfNotExists`, `createTextSource`), `types` (`Team`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
