<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# obsPlaybackSettings

## Purpose
`POST /api/obsPlaybackSettings` re-applies the current playback policy to every
**existing** `ffmpeg_source` already in OBS, so a Studio-Mode / restart config
change takes effect without deleting and re-adding streams. The policy is driven
by `OBS_RESTART_ON_ACTIVATE` plus `close_when_inactive:false` /
`clear_on_media_end:false`, and each updated live source is also muted
(`SetInputMute`) so no stream audio reaches the broadcast tracks. Delegates
entirely to `lib/obsClient.applyPlaybackSettingsToInputs()`.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `POST` handler. Calls `applyPlaybackSettingsToInputs()`, returns `{success, message, updated, skipped}`; local-file sources are reported as `skipped`. 500 on OBS connect/apply failure. |

## For AI Agents
### Working In This Directory
- This route only mutates live stream `ffmpeg_source` inputs; it intentionally
  skips local-file sources (reported in `skipped`).
- All OBS behavior lives in `lib/obsClient` — keep the route a thin wrapper and
  change the policy there, not here.
- Build the human-readable `message` from `updated.length` / `skipped.length`;
  don't leak raw OBS payloads to callers.

### Testing Requirements
- `npm test` from repo root with `lib/obsClient` mocked.

## Dependencies
### Internal
- `lib/obsClient` (`applyPlaybackSettingsToInputs`).
### External
- `next`, `obs-websocket-js` (transitively, via `lib/obsClient`).

<!-- MANUAL: notes below preserved on regeneration -->
