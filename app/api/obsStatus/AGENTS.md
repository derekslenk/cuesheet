<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# obsStatus

## Purpose
`GET /api/obsStatus` reports OBS connection health and live state: configured host/port, whether a password is set, connection status, OBS/obs-websocket versions, current program (and preview) scene, scene count, and streaming/recording/studio-mode flags. Used by the settings/diagnostics UI.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler. Reads `OBS_WEBSOCKET_HOST`/`PORT`/`PASSWORD` env vars, reuses the live client from `getConnectionStatus()` or establishes one via `getOBSClient()`, then aggregates `GetVersion`, `GetCurrentProgramScene`, `GetSceneList`, `GetStreamStatus`, `GetRecordStatus`, `GetStudioModeEnabled` (and `GetCurrentPreviewScene` when studio mode is on). |

## For AI Agents
### Working In This Directory
- OBS errors are captured into the response `error` field (still HTTP 200) rather than throwing; only a top-level failure returns 500.
- `lib/obsClient` is loaded via `require(...)`.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/obsClient` (`getOBSClient`, `getConnectionStatus`).
### External
- `obs-websocket-js`.

<!-- MANUAL: notes below preserved on regeneration -->
