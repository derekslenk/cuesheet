<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# getActive

## Purpose
`GET /api/getActive` reports which source is currently selected on each of the seven screen positions by reading the obs-source-switcher `${screen}.txt` files from `FILE_DIRECTORY`. Returns `{ <screen>: <sourceName|null> }`. No OBS WebSocket call — it reads the plugin contract files directly from disk.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler. Resolves `FILE_DIRECTORY` (env `FILE_DIRECTORY` or `./files`), ensures it exists, then reads `${screen}.txt` for each entry in `SCREEN_POSITIONS`, trimming contents or returning `null` if the file is absent. |

## For AI Agents
### Working In This Directory
- Screen basenames come from `SCREEN_POSITIONS` (`large`, `left`, `right`, `top_left`, `top_right`, `bottom_left`, `bottom_right`) — no `ss_` prefix. These are the files the OBS plugin polls; `setActive` writes them.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/apiHelpers`, `lib/constants` (`SCREEN_POSITIONS`).
### External
- Node `fs`, `path`.

<!-- MANUAL: notes below preserved on regeneration -->
