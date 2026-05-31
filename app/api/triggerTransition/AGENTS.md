<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# triggerTransition

## Purpose
`POST /api/triggerTransition` fires the OBS studio-mode transition, pushing the current preview scene to program. Requires studio mode to be enabled (returns 400 otherwise). Returns the resulting program and preview scene names.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Checks `GetStudioModeEnabled`, calls `TriggerStudioModeTransition`, then reads back `GetCurrentProgramScene` + `GetCurrentPreviewScene` in parallel. |

## For AI Agents
### Working In This Directory
- Completes the studio-mode flow started by `setScene` (which sets the preview scene).

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/obsClient` (`getOBSClient`).
### External
- `obs-websocket-js`.

<!-- MANUAL: notes below preserved on regeneration -->
