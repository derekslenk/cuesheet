# Load + switching test harness

Validates OBS decoding ~40 concurrent mpegts Media Sources on the event host **and**
that the source-switcher shows the right feed — without sourcing 40 real Twitch streams.
Each feed renders a big `STREAM NNNN` label + a running clock, so switching is visually
unambiguous and the test is fully reproducible.

## Why this is faithful (and cheap)
- Streams, OBS sources, and switcher entries are created via the **real** webui APIs
  (`/api/addStream`, `/api/teams`) — the exact production wiring.
- Generators stream a **pre-encoded clip with `-c copy`** (no re-encode) to the same
  deterministic UDP ports OBS reads (`lib/relayPort`). That mirrors the real
  streamlink→ffmpeg relay cost, so the OBS-decode load under test isn't masked by 40
  live H.264 encodes.
- The only synthetic part is the picture; OBS can't tell a testsrc-fed UDP feed from a
  Twitch-fed one. (It does **not** exercise the streamlink→Twitch pull path — that
  per-stream cost is already known/bounded; layer a small real-Twitch test on top if you
  want to validate the pull side.)

## Prereqs
- Run on the Windows host with the **webui running** (`:3000`).
- **Stop the streamlink supervisor first** — it competes for the same relay UDP ports.
- `FFMPEG_PATH` set to the versioned scoop exe (as the other launchers do).

## Commands
```
npm run loadtest -- seed 40     # create 40 LOADTEST streams (OBS sources + switcher)
npm run loadtest -- prep 40     # pre-encode 40 numbered clips (one-time, cached in %TEMP%/cuesheet-loadtest)
npm run loadtest -- start       # stream every LOADTEST feed (foreground; Ctrl+C stops all)
npm run loadtest -- cycle 1500  # auto-switch the active source every 1500ms (switching stress)
npm run loadtest -- status      # streams / running generators / supervisor state
npm run loadtest -- stop        # kill generators (best-effort)
npm run loadtest -- teardown    # stop + delete all LOADTEST streams and the team
```

## Suggested run (dry-run small first)
1. `seed 4` → `prep 4` → `start` in one terminal; refresh OBS sources; confirm 4 numbered
   feeds appear and switching shows the right number. `Ctrl+C`, then `teardown`.
2. Once happy, `seed 40` → `prep 40` → `start`, and watch host CPU / OBS dropped+skipped
   frames / memory in the monitor while you switch (or run `cycle`). Tune
   `PREVIEW_MAX_CONCURRENT` and any caps from what you observe.

## Env overrides
`LOADTEST_WEBUI` (default `http://127.0.0.1:3000`), `FFMPEG_PATH`, `LOADTEST_FONT`
(default `C:/Windows/Fonts/arial.ttf`), `LOADTEST_W` / `LOADTEST_H` / `LOADTEST_FPS`
(default 1280×720×30), `LOADTEST_CLIP_SECONDS` (default 30).
