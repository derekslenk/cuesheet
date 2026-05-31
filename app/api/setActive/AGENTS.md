<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# setActive

## Purpose
`POST /api/setActive` is the hot-path switcher endpoint. Given `{ screen, id }` it looks up the stream (joined to its team), computes the `<group>_<stream>_stream` source name, and atomically writes it into `${FILE_DIRECTORY}/${screen}.txt` — the file the obs-source-switcher plugin polls. No OBS WebSocket call; switching happens entirely through the file contract. Logs a JSON line with elapsed `ms` for latency tracking.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Validates via `validateScreenInput`, joins `TABLE_NAMES.STREAMS`↔`TEAMS`, and writes the screen file with `atomicWriteFileSync` (temp-file + rename, to avoid torn reads by the plugin). |

## For AI Agents
### Working In This Directory
- `atomicWriteFileSync` (from `lib/atomicWrite`) is required for correctness — the plugin may read mid-write. Do not replace it with a plain `fs.writeFileSync`.
- `FILE_DIRECTORY()` comes from the root `config.js` (env `FILE_DIRECTORY` or `./files`).
- The written value must match the switcher entry names registered by `addStream`.

### Testing Requirements
- Atomic-write behavior is soak-tested via `scripts/atomicWriteSoak*`. Run `npm test` from repo root.

## Dependencies
### Internal
- `config` (`FILE_DIRECTORY`), `lib/database`, `lib/security` (`validateScreenInput`), `lib/constants` (`TABLE_NAMES`), `lib/atomicWrite`, `types` (`StreamWithTeam`).
### External
- Node `fs`/`path`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
