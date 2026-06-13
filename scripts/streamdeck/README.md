# Stream Deck XL control (`npm run deck`)

A standalone Node sidecar that turns an Elgato Stream Deck XL into a control
surface for cuesheet: **tap a stream slot → pick a team → pick a streamer**, and
that streamer goes live in the slot. It also drives the OBS layout
(1/2/4-Screen) and the Studio-Mode cut, straight from the deck.

## Run

1. **Close the Elgato Stream Deck software** — the deck takes exclusive control of the USB device.
2. Make sure the cuesheet web server is up (`npm run dev` / `cuesheet dev`, port 3000).
3. `npm run deck`

`Ctrl-C` to stop (clears and releases the device).

## Start/stop from the CLI & TUI

The deck is a tracked process alongside the web server and supervisor:

- `cuesheet start --which deck` — launch it detached (spawns `node + tsx` under the hood).
- `cuesheet stop --which deck` — stop exactly that process.
- `cuesheet gui` — in the dashboard, the **`d`** key toggles the stream-deck on/off; a `stream-deck` row shows its running state.

The deck is **opt-in**: it is deliberately *not* part of `--which both`, so plain `cuesheet start`/`stop` (and the TUI's `s`/`x`/`r` keys) still only touch web + supervisor. Note: the deployed `cuesheet` binary must be rebuilt (`npm run binary:build:win`) for the compiled TUI to include deck control; `npm run deck` works without any rebuild.

## How it works

- Talks **only** to the existing cuesheet HTTP API (localhost, no auth) — zero backend changes.
- Polls `GET /api/getActive` (~2s) to reflect live state, and refetches the roster
  (`/api/teams` + `/api/streams`, ~45s) so mid-event signups appear.
- Owns the whole 32-key surface and repaints per navigation level.
- Assigning a streamer is optimistic: the slot updates immediately, then reconciles
  to the server on the next poll. A failed `setActive` reverts (never a silent success).

## Layout (XL = 8 columns × 4 rows)

- **Home:** the 7 slots arranged like the webui — `LARGE` (row 1), `LEFT`/`RIGHT`
  (row 2), and the four corners as a 2×2 (rows 3–4) — each showing its current
  streamer. Scene-layout keys (`1 SCR` / `2 SCR` / `4 SCR`) sit at the right edge of
  each group's row; `GO LIVE` (OBS Studio-Mode transition) and `REFRESH` (force the
  deck to re-poll) are bottom-right.
- **Teams / Streamers:** a paginated list (29 per page) with `BACK` (key 24),
  `‹` prev page (30), `›` next page (31).

## Config (environment)

| Var | Default | Purpose |
|---|---|---|
| `CUESHEET_URL` | `http://localhost:3000` | cuesheet web base URL |
| `DECK_POLL_MS` | `2000` | `getActive` poll interval |
| `DECK_ROSTER_REFRESH_MS` | `45000` | teams/streams refetch interval |
| `DECK_REQUEST_TIMEOUT_MS` | `4000` | per-request HTTP timeout to the cuesheet API |
| `DECK_BRIGHTNESS` | `80` | key brightness, 0–100 |
| `DECK_LOCK_DIR` | OS temp dir | where the single-instance lock lives |
| `DECK_SMOKE_MS` | (unset) | if set, auto-stop after N ms (verification only — never set on the event host) |

## Notes & limits

- **Two ways to run it:**
  - `npm run deck` runs in the **foreground** in its own terminal (Ctrl-C to stop). It is *not* recorded in the process table, so it does **not** appear as a row in `cuesheet status` / `watch` / `gui`.
  - `cuesheet start --which deck` launches the **tracked, detached** form: it writes a process record, shows up as the `stream-deck` row in `cuesheet status` / `watch` / `gui`, and is reaped by `cuesheet stop --which deck` (or the **`d`** key in `gui`).
- **Opt-in:** the deck is deliberately *not* part of `--which both`, so plain `cuesheet start`/`stop` and the TUI `s`/`x`/`r` keys only ever touch web + supervisor.
- **Repo checkout required:** `--which deck` (and `npm run deck`) spawn `node` + `tsx` against `scripts/streamdeck/`, so they need the project source with `node_modules` installed. The deck is **not** bundled into the standalone `cuesheet` binary; starting it from a binary run outside a repo fails fast with a clear message. The deployed binary must be rebuilt (`npm run binary:build:win`) for the compiled TUI's `d` key to include deck control — `npm run deck` needs no rebuild.
- **Single instance:** a `cuesheet-deck.lock` file guards against two decks fighting the device; a stale lock from a crashed run is reclaimed automatically.
- **Survives a web restart:** if the web server restarts while the deck is running, the deck keeps polling — keys may blank briefly while `:3000` is down, then re-populate automatically when it returns. A blank deck during a web restart is expected, not a fault.
- Runs under **Node (tsx)**, deliberately not the bun-compiled `cuesheet` binary (keeps the native HID dependency out of `bun --compile`).
- **Build/CI:** `scripts/streamdeck/**` is type-checked via `npm run type-check:deck` (excluded from the base `type-check`) and gated in CI through the `web` job. Deps: `@napi-rs/canvas` (rendering) and `@elgato-stream-deck/node` (optional; the device adapter only).

## Security

The deck talks to the cuesheet API over **plain HTTP with no authentication**, on the
assumption that `CUESHEET_URL` points at **localhost**. Do **not** point it at a
non-loopback address: the API has no auth for a localhost-style host, so a remote URL
would either fail or expose unauthenticated OBS/scene control on the network. Keep the
cuesheet host firewalled to loopback (or set `API_KEY` on the server) for the event.

## Tests

`npm test` runs the deck suite — pure logic, layout/pagination, the HTTP client,
rendering, and the controller driven through a **fake device** (no hardware needed).
Physical key-press input and on-device rendering are wired and unit-tested against the
fake, but **not yet confirmed on real hardware**: plug the deck in, run `npm run deck`,
and tap a slot to confirm the end-to-end path before relying on it live.
