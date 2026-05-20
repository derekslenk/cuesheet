# convertBrowserToMedia

Convert browser_source inputs in an OBS scene-collection JSON into
ffmpeg_source inputs pointing at the Streamlink supervisor's per-stream
UDP endpoints (Phase 1.3 of the iter-3.4 plan).

## Safety contract (Phase 1.3 G1.3)

- **OBS-running check.** Refuses to run if `obs64.exe` (Windows) or
  `OBS` (macOS) is currently running. OBS rewrites the scene-collection
  JSON on its own shutdown, so editing it under a live OBS would be
  silently overwritten. `--dry-run` skips this check.
- **Timestamped backup.** Always copies the scene-collection file to
  `<backupRoot>/scenes.backup.<ISO>/<basename>` before writing. The
  backup directory must not already exist (defensive — refuses to
  overwrite previous backups).
- **--dry-run.** Skips the OBS check and the file rewrite. Emits a
  sibling `<scene>.diff.json` describing what would change so the
  operator can review before committing.

## Mapping sources

Each browser_source input needs an OBS UDP URL to map to. Either:

- **`--supervisor-url <url>`** — fetches the mapping from the
  supervisor's `/health` endpoint (recommended workflow):

  ```sh
  tsx scripts/convertBrowserToMedia.ts \
    --scene-file C:\Users\derek\AppData\Roaming\obs-studio\basic\scenes\SaT.json \
    --supervisor-url http://127.0.0.1:8080 \
    --dry-run
  ```

- **`--mapping-file <path.json>`** — reads a static JSON file. The file
  shape is `{ "<sourceName>": "<udpUrl>" }`:

  ```json
  {
    "team_alpha_main": "udp://127.0.0.1:9001",
    "team_beta_main":  "udp://127.0.0.1:9002"
  }
  ```

## Usage

```sh
# Preview (no changes, no OBS check):
tsx scripts/convertBrowserToMedia.ts \
  --scene-file <path-to-scene-json> \
  --supervisor-url http://127.0.0.1:8080 \
  --dry-run

# Real run (OBS must be closed):
tsx scripts/convertBrowserToMedia.ts \
  --scene-file <path-to-scene-json> \
  --supervisor-url http://127.0.0.1:8080
```

Args:

| Arg | Default | Description |
|---|---|---|
| `--scene-file` | required | OBS scene-collection JSON path |
| `--supervisor-url` | — | Supervisor base URL (e.g. http://127.0.0.1:8080); takes precedence over file if both given |
| `--mapping-file` | — | Path to JSON mapping; one of --supervisor-url / --mapping-file is required |
| `--backup-root` | `<scene-dir>/scenes.backup` | Where to put `scenes.backup.<ISO>/` |
| `--timestamp` | current ISO | Override the backup folder timestamp suffix |
| `--dry-run` | false | Skip OBS check + file rewrite; emit `<scene>.diff.json` |

## Rollback

Backups are written byte-identical with the original. To revert:

```powershell
# Windows
copy /Y C:\OBS\backups\scenes.backup.2026-05-20T17-30-00\SaT.json `
  C:\Users\derek\AppData\Roaming\obs-studio\basic\scenes\SaT.json
```

```sh
# macOS / Unix
cp scenes.backup.2026-05-20T17-30-00/SaT.json /path/to/SaT.json
```

Or programmatically via `restoreFromBackup` in `backup.ts`.

## What this does NOT do

- **Launch OBS to validate the conversion.** Plan G1.3 calls for a
  post-conversion smoke test (OBS opens both collections, all 7 inputs
  resolve, 4-Screen renders). That step is operator-driven in the
  [PROD-HOST] dress rehearsal — manual launch + visual confirmation —
  rather than scripted, because OBS' headless validation surface is
  thin and brittle on Windows.
- **Plugin contract documentation.** `docs/plugin-contract.md` already
  captures the contract from Phase 0.5.2 / 0.7. After the first real
  PROD-HOST round-trip, document the encoder/codec class observed
  there.
- **Modify source-switcher (`ss_*`) inputs.** Only `browser_source`
  inputs are rewritten. The source-switcher choreography stays
  intact (S4' coverage check from Phase 0.7.3 still applies).
