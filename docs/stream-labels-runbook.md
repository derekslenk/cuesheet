# Stream Labels — Operator & Dev Runbook

How the HTML-driven stream labels work, how to drive them, and how to spot and
fix problems. Design spec: [`overlay-label-design.md`](./overlay-label-design.md).

## What they are

Each stream's on-screen label is a transparent **HTML browser source** in its
nested `*_stream` OBS scene, pointing at `/overlay/stream/<id>` served by this
app. The page renders the whole plate — team name, streamer name, per-team
colors + logo, an entrance animation, a live Twitch viewer count, and a role
chip — and composites over the video. Because the browser source rides inside
the nested scene, it scales with the stream into whatever 1/2/4-Screen cell the
switcher routes it to.

The label is data-driven: `GET /api/overlay/<id>` returns the static fields,
and the page polls `GET /api/overlay/<id>/viewers` (~30s) for the live count.

## Renderer + revert

`LABEL_RENDERER` (env) selects the renderer for **newly created** streams:

- `html` (default) — the browser-source overlay described here.
- `obs` — the legacy 5-input native-text labels (instant revert if the HTML
  path ever misbehaves on air). Existing scenes are unaffected until re-added.

Other env knobs: `LABEL_SHUTDOWN_WHEN_HIDDEN` (default `true` — destroy a
label's CEF when its cell isn't shown, bounding memory), `LABEL_FPS` (default
`15`, clamped to `1–60` — render framerate for the mostly-static label browser
source; lower trims CEF CPU, confirm against the US-005 spike before changing),
`LABEL_OVERLAY_BASE_URL` (default `http://localhost:3000`; set to
`http://<host-ip>:3000` if OBS is on another LAN machine), `TWITCH_CLIENT_ID` /
`TWITCH_CLIENT_SECRET` (viewer counts).

## Per-team branding (colors + logo)

Set on the **Teams** page (🎨 Branding): background, accent, text colors + a
logo path (drop the file in `public/logos/` and enter e.g. `/logos/team.png`).
Unset values fall back to the event-default palette. The required DB columns are
added automatically on app start (see "Schema self-heal").

## Roles

Each stream can carry a role (Key Courier / Tank / Healer / DPS / Standby) shown
as a chip. Set it on the **Edit stream** page, or let `npm run import:sheet`
populate it from the signup sheet (the importer parses role per column).

## Live viewer counts (Twitch)

Requires a Twitch app — create one at <https://dev.twitch.tv/console/apps> and
put `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` in `.env.local`. The count is
best-effort: with no creds (or an offline channel) it is simply omitted; the
label still renders. Counts are cached ~25s and polled by each label ~30s.

## Schema self-heal

`lib/database.ts` adds any missing columns (role + team branding) to the active
event's tables on startup — so you never depend on a migration script having hit
the right DB. (Standalone migrations like `npm run add-team-branding-columns`
still exist for explicit/offline use.)

## Test tooling

All run via `tsx --env-file=.env.local` so they target the configured
`FILE_DIRECTORY` (the live DB), not the default `./files`:

| Command | What it does |
| --- | --- |
| `npm run setup:test-event` | Reset + seed an isolated `testing_2026` event: 3 branded teams + logos, 6 streams (ids 1–6), varied roles. DB only. |
| `npm run seed:live-test -- --count 8 --teams 2` | Seed a test event with the top-N **currently-live** Twitch channels (real video). Needs Twitch creds. DB only. |
| `npm run clone:event -- --from <key> --to <key> [--reset]` | Copy all teams + streams (incl. branding/role) from one event into another. DB only. |
| `npm run add-team-branding-columns` | Explicit branding-column migration (also auto-applied on start). |

To use a test event: set `EVENT_KEY=<key>` in `.env.local`, **restart** the app,
open `/overlay/stream/<id>`. Switch `EVENT_KEY` back to the real event when done.
Test events are DB-only — to get OBS scenes, add the streams through the UI.

## Switching events (and starting OBS fresh)

`npm run event:switch -- --to <key>` walks you through it: it reports whether the
target event has data, prints the backup + OBS steps, and gives you the exact
`EVENT_KEY` line (add `--write-env` to flip it in `.env.local` for you, backed up
to `.env.local.bak`). It deliberately does **not** touch OBS.

The full "start fresh" flow, which **preserves your Source Switcher arrangement**:

1. **Back up** the scene collection (Scoop OBS:
   `%USERPROFILE%\scoop\persist\obs-studio\config\obs-studio\basic\scenes\*.json`).
2. In OBS, **Scene Collection → Duplicate** the current one, then switch to the
   duplicate (the original stays intact).
3. `npm run clean:obs-collection` (dry-run) then `-- --apply`. This removes the
   per-stream/team scenes and empties each switcher's source list, but **keeps
   the 1/2/4-Screen scenes and the positioned `ss_*` switcher elements** — so the
   layout you arranged is not lost and you don't re-import anything. (Add
   `--host <ip>` if OBS is on another machine.)
4. `npm run event:switch -- --to <key> --write-env`, then **restart** the webui
   (and supervisor). Seed the event first if it's empty (`setup:test-event` /
   `seed:live-test` / `clone:event`).
5. Add the event's streams via the UI to populate the switchers + labels.

To return: switch OBS back to the original collection, `event:switch` back, restart.

> Tip: to keep a reusable clean base for future events, do steps 2–3 once, then
> OBS → Scene Collection → **Export** the cleaned collection — that's an
> OBS-authored, guaranteed-valid scaffolding you can re-import any time.

## Health & observability

**Settings → Stream Label System** shows: renderer, overlay base URL, Twitch
configured?, stream/branded-team counts, and two failure counters:

- **Stale label hits (404)** — requests for an unknown stream id, i.e. a baked
  overlay URL pointing at a deleted stream (a silently-blank label on air).
  Climbing = a scene needs re-adding. Raw: `GET /api/overlay/health`.
- **Viewer lookup failures** — Twitch viewer fetches that errored.

Counters are in-memory (reset on restart). The overlay also logs
`[overlay] unknown stream id <id>` on a stale hit.

## Operator gotchas

- **Re-import re-bakes URLs.** `import:sheet --apply-changes` deletes + re-adds
  changed streams, giving them new ids and re-creating their scenes (so the
  baked `/overlay/stream/<id>` URL is refreshed). An overlay pointed at a
  deleted id renders a visible magenta **NO DATA** box (not a silent gap) and
  bumps the 404 counter.
- **Labels need this app running.** If the Next server is down, labels render
  blank (transparent). Keep it up during a broadcast; the health panel + 404
  counter help catch problems off-air.
- **Switching `EVENT_KEY` repoints the whole app** (webui + supervisor). Restart
  after changing it.

## Migrating existing OBS scenes to HTML labels

Scenes created under the legacy `obs` renderer keep their native 5-input labels
until the stream is **deleted and re-added** (which is also how re-import works).
Teardown sweeps both the new `_label` browser source and the legacy inputs, so
mixed fleets clean up correctly.

## Pending: live OBS verification (US-005)

Not yet verified on real OBS hardware:

1. Add a test stream; confirm its `_label` browser source renders over the video
   and scales into 1/2/4-Screen cells.
2. Switch it between cells and delete it — confirm **no OBS crash**.
3. Measure CEF process count + RAM + switch-in latency for
   `LABEL_SHUTDOWN_WHEN_HIDDEN=true` vs `false` across a populated 4-Screen, and
   set the posture that meets the budget (≤150 MB/CEF, ≤~2 GB total, ≤1
   transition switch-in latency).
