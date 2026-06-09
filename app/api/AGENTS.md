<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-06-08 -->

# api

## Purpose
The Next.js App Router API layer for CueSheet. These route handlers expose the team/stream data model (SQLite) and orchestrate OBS Studio: some routes talk to OBS over the obs-websocket-js connection (scenes, groups, transitions, status), while the live source-switching hot path writes the obs-source-switcher plugin's `${screen}.txt` files on disk instead of calling OBS. All `/api/*` requests pass through `middleware.ts`, which enforces an optional `API_KEY` for non-local external callers.

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `__tests__` | Jest tests for routes + a year-hardcode drift guard (see `__tests__/AGENTS.md`). |
| `addStream` | `POST` add a stream: create OBS group/source + register in switchers, insert DB row (see `addStream/AGENTS.md`). |
| `counts` | `GET` stream/team row counts (see `counts/AGENTS.md`). |
| `createGroup` | `POST` create/reuse an OBS group for a team, persist UUID (see `createGroup/AGENTS.md`). |
| `getActive` | `GET` current source per screen by reading `${screen}.txt` (see `getActive/AGENTS.md`). |
| `getCurrentScene` | `GET` OBS current program scene (see `getCurrentScene/AGENTS.md`). |
| `getTeamName` | `GET` a team's name by `team_id` (see `getTeamName/AGENTS.md`). |
| `obsPlaybackSettings` | `POST` re-apply playback policy to existing OBS ffmpeg sources (see `obsPlaybackSettings/AGENTS.md`). |
| `obsStatus` | `GET` OBS connection + live status (see `obsStatus/AGENTS.md`). |
| `preview/[...slug]` | `GET` per-stream HLS preview (ffmpeg packager) for in-browser monitoring (see `preview/[...slug]/AGENTS.md`). |
| `setActive` | `POST` switch a screen's source via atomic file write — hot path (see `setActive/AGENTS.md`). |
| `setScene` | `POST` switch OBS layout scene (preview or program) (see `setScene/AGENTS.md`). |
| `streams` | `GET` all streams; `[id]` for per-stream CRUD (see `streams/AGENTS.md`). |
| `syncGroups` | `POST` bulk-create OBS groups for group-less teams (see `syncGroups/AGENTS.md`). |
| `teams` | `GET`/`POST` teams; `[teamId]` for per-team PUT/DELETE (see `teams/AGENTS.md`). |
| `triggerTransition` | `POST` fire OBS studio-mode transition (see `triggerTransition/AGENTS.md`). |
| `verifyGroups` | `GET` DB↔OBS scene drift report (see `verifyGroups/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- Two interaction styles: OBS-WebSocket routes use the shared persistent client from `lib/obsClient` (`getOBSClient`), while `setActive`/`getActive` use only the `${screen}.txt` file contract (`lib/atomicWrite`, `config.FILE_DIRECTORY`).
- Table names always come from `lib/constants` (`TABLE_NAMES`) — never hard-code a year (enforced by `__tests__/yearHardcodeGuard.test.ts`).
- The source-name convention `<group_or_team>_<stream>_stream` (lowercased, spaces→`_`) must stay consistent across `addStream`, `setActive`, `streams/[id]`, `teams/[teamId]`, and `verifyGroups`.
- Response shape varies: newer routes use `lib/apiHelpers` (`withErrorHandling`, `createSuccessResponse`, `createDatabaseError`); older ones build `NextResponse.json` directly.

### Testing Requirements
- Run `npm test` from repo root. Routes are unit-tested with `lib/database`/`lib/obsClient` mocked.

### Common Patterns
- Dynamic routes (`streams/[id]`, `teams/[teamId]`) must `await params` (Next.js 15).
- OBS cleanup on delete is best-effort and never blocks the DB mutation.

## Dependencies
### Internal
- `lib/database` & `lib/db`, `lib/obsClient`, `lib/constants`, `lib/apiHelpers`, `lib/security`, `lib/atomicWrite`, `config.js`, `types`.
### External
- `next`, `obs-websocket-js`, `sqlite`/`sqlite3`.

<!-- MANUAL: notes below preserved on regeneration -->
