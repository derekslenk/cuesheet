<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# setScene

## Purpose
`POST /api/setScene` switches the OBS layout scene. Body: `{ sceneName }`, restricted to `1-Screen`, `2-Screen`, `4-Screen`. If studio mode is enabled it sets the preview scene (caller then triggers a transition); otherwise it sets the program scene directly.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Validates `sceneName` against `VALID_SCENES`, checks `GetStudioModeEnabled`, then calls `SetCurrentPreviewScene` or `SetCurrentProgramScene`. |

## For AI Agents
### Working In This Directory
- `VALID_SCENES` is a hard-coded allowlist of layout scene names; update it here if the scene collection's layout scenes change.
- Pairs with `triggerTransition` for the studio-mode preview→program flow.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/obsClient` (`getOBSClient`).
### External
- `obs-websocket-js`.

<!-- MANUAL: notes below preserved on regeneration -->
