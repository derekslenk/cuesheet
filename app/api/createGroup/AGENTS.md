<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# createGroup

## Purpose
`POST /api/createGroup` creates (or reuses) an OBS scene/group for an existing team and records its name and UUID on the team row. Body: `{ teamId, groupName }`. The group name is sanitized to alphanumerics/spaces/dashes/underscores before being passed to OBS.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Validates `teamId` with `validateInteger`, calls `createGroupIfNotExists` (from `lib/obsClient`) to get the scene UUID, then `UPDATE`s `group_name`/`group_uuid` on `TABLE_NAMES.TEAMS`. |

## For AI Agents
### Working In This Directory
- OBS group is created first so its `sceneUuid` can be persisted; DB and OBS state are meant to stay aligned (see `verifyGroups`).
- `lib/obsClient` is pulled in via `require(...)` (CommonJS), unlike the ESM imports elsewhere.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/constants` (`TABLE_NAMES`), `lib/security` (`validateInteger`), `lib/db` (`withDb`), `lib/obsClient` (`createGroupIfNotExists`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
