<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# addStream

## Purpose
`POST /api/addStream` adds a stream to a team. It validates the body, looks up the team's group/scene name, connects to OBS over WebSocket, and (if the source does not already exist) creates the OBS stream group with a text overlay, backfills the team's `group_uuid`, and registers the new `<group>_<stream>_stream` source in each of the seven obs-source-switcher inputs. Finally it inserts the stream row into SQLite and disconnects from OBS.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Uses `validateStreamInput`, `createStreamGroup`, `addSourceToSwitcher`, `getOBSClient`; iterates `SOURCE_SWITCHER_NAMES` (the 7 `ss_*` switcher inputs); writes to `TABLE_NAMES.STREAMS`/`TEAMS`. |

## For AI Agents
### Working In This Directory
- OBS source name is derived as `<group_or_team>_<stream>` (lowercased, spaces → `_`); the switcher entry name adds a `_stream` suffix. Keep this convention in sync with `setActive`, `streams/[id]` delete, and `verifyGroups`.
- The handler opens a fresh OBS connection and always calls `disconnectFromOBS()` on both success and error paths.
- OBS failures while registering switcher sources are logged per-screen but do not abort the DB insert.

### Testing Requirements
- No dedicated test; covered indirectly. Run `npm test` from repo root.

### Common Patterns
- Input validation via `lib/security` returning `{ valid, data, errors }`.

## Dependencies
### Internal
- `lib/database`, `lib/db` (`withDb`), `lib/obsClient`, `lib/constants` (`TABLE_NAMES`, `SOURCE_SWITCHER_NAMES`), `lib/security`.
### External
- `obs-websocket-js` (via `obsClient`), `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
