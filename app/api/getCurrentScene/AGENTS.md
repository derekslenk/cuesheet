<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# getCurrentScene

## Purpose
`GET /api/getCurrentScene` returns the name of OBS's current program scene via the `GetCurrentProgramScene` WebSocket request. Read-only OBS query, no DB access.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler. Uses the shared `getOBSClient()` connection and returns `{ success, data: { sceneName }, message }`; OBS errors return HTTP 500. |

## For AI Agents
### Working In This Directory
- Uses the persistent OBS client from `lib/obsClient`; it does not open/close its own connection.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/obsClient` (`getOBSClient`).
### External
- `obs-websocket-js`.

<!-- MANUAL: notes below preserved on regeneration -->
