<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# verifyGroups

## Purpose
`GET /api/verifyGroups` is a drift-detection diagnostic that compares the DB's team groups and expected stream scenes against OBS's actual scene list. It reports teams missing in OBS, teams whose scene was renamed (matched by UUID but name differs), and orphaned OBS scenes that belong to neither the DB nor the known system scenes.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler. Loads teams (with group set) and streams from the DB, fetches `GetSceneList` from OBS, matches teams by `group_uuid` then `group_name`, derives expected `<group>_<stream>_stream` scene names, and classifies scenes using the `SYSTEM_SCENES` allowlist (`1/2/4-Screen`, `Starting`, `Ending`, `Audio`, `Movies`, `Resources`). |

## For AI Agents
### Working In This Directory
- Read-only: it never mutates the DB or OBS — output drives manual reconciliation (`syncGroups`/`createGroup`).
- UUID matching is preferred over name matching; a UUID match with a changed name flags `name_changed`.
- Keep `SYSTEM_SCENES` current with the production scene collection to avoid false orphan reports.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/obsClient` (`getOBSClient`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
