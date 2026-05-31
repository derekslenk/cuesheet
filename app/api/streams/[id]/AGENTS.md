<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# streams/[id]

## Purpose
Per-stream CRUD on the dynamic route `/api/streams/[id]`. `GET` returns one stream; `PUT` updates `name`/`obs_source_name`/`url`/`team_id`; `DELETE` performs comprehensive OBS cleanup (removes the stream's OBS components and clears any switcher text files referencing it) before deleting the DB row.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET`, `PUT`, `DELETE` handlers. All `await params` (Next.js 15 async params). `DELETE` joins team info, calls `deleteStreamComponents` and `clearTextFilesForStream` (from `lib/obsClient`), then `DELETE`s from `TABLE_NAMES.STREAMS`. |

## For AI Agents
### Working In This Directory
- `params` is a `Promise` and must be awaited (Next.js 15 convention).
- OBS cleanup is best-effort: failures are logged but the DB delete still proceeds.
- The text file the delete clears is keyed by `<group>_<stream>_stream` — keep this name derivation consistent with `setActive`/`addStream`.

### Testing Requirements
- Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/obsClient` (`deleteStreamComponents`, `clearTextFilesForStream`).
### External
- `obs-websocket-js`, `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
