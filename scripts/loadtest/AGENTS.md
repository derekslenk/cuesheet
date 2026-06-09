<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# loadtest

## Purpose
Load + switching test harness. Validates two things on the event host without
sourcing real Twitch streams: (a) OBS decoding ~40 concurrent mpegts Media
Sources, and (b) the source-switcher selecting the *right* feed. Each synthetic
feed renders a big `STREAM NNNN` label + a running clock so switching is visually
unambiguous and fully reproducible.

## Key Files
| File | Description |
| --- | --- |
| `index.ts` | The harness. Exports `run(argv)` (invoked by `cuesheet loadtest` / `npm run loadtest`). Subcommands: `seed N`, `prep N`, `start`, `cycle <ms>`, `status`, `stop`, `teardown`. |
| `README.md` | Rationale (why this is faithful + cheap), prereqs, command reference, suggested dry-run, env overrides. |

## For AI Agents
### Working In This Directory
- Fidelity is the point: streams/sources/switcher entries are created through
  the **real** webui APIs (`/api/addStream`, `/api/teams`), and generators
  stream a pre-encoded clip with `-c copy` (no re-encode) to the same
  deterministic UDP ports OBS reads (`lib/relayPort`). Don't replace API calls
  with direct DB writes or it stops testing production wiring.
- Screen/source names come from `lib/constants` (`SCREEN_POSITIONS`) — never
  hard-code them (a past bug sent the wrong key during `cycle`).
- Prereqs to honor in docs/logic: webui must be running on `:3000`, the **real
  streamlink supervisor must be stopped** (it fights for the same relay UDP
  ports), and `FFMPEG_PATH` must point at the versioned ffmpeg.
- Pre-encoded clips are cached under `%TEMP%/cuesheet-loadtest`; `prep` is the
  one-time encode step.

### Testing Requirements
- No unit tests (it's an interactive host harness). Validate via the README's
  dry-run: `seed 4` → `prep 4` → `start`, confirm 4 numbered feeds + correct
  switching, then `teardown`.

## Dependencies
### Internal
- `lib/relayPort` (UDP port mapping), `lib/constants` (`SCREEN_POSITIONS`); the
  webui APIs `/api/addStream`, `/api/teams`. Exposed as the `cuesheet loadtest`
  passthrough (`src/cli/commands/loadtest.ts`).
### External
- `ffmpeg` (spawned generators), Node `child_process`/`fs`/`os`.

<!-- MANUAL: notes below preserved on regeneration -->
