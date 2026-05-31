<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# files

## Purpose

Runtime data directory (the default `FILE_DIRECTORY`, overridable via the `FILE_DIRECTORY` env var). It holds the live SQLite database (`sources.db`) and the per-screen switcher text files that the upstream **obs-source-switcher** OBS plugin polls. CueSheet's `setActive` flow writes the active stream-group name (e.g. `jellyfish_palpatine_stream`) into one `${screen}.txt` file per screen position; the plugin reads that file (~1000 ms poll) and switches the corresponding `ss_<position>` OBS input. This directory is created on demand by `lib/database.ts` if missing.

## Key Files

| File | Description |
|------|-------------|
| `sources.db` | Live SQLite database opened by `lib/database.ts`. Contains the `streams_*` and `teams_*` season-suffixed tables (see `docs/schema.md`). Created/initialized on first DB access. |
| `sources.template.db` | Seed/template database — a clean schema-only starting point used to provision a fresh `sources.db`. |
| `${screen}.txt` | Per-screen switcher files written atomically by `setActive` (via `lib/atomicWrite.ts`). Basenames come from `SCREEN_POSITIONS` in `lib/constants.ts`: `large`, `left`, `right`, `top_left`, `top_right`, `bottom_left`, `bottom_right` → `large.txt` … `bottom_right.txt`. Plain UTF-8, no BOM, no trailing newline; content is one stream-group name or empty. |
| `SaT.json` | OBS scene-collection JSON snapshot for the stream-a-thon (`SaT`) collection — reference/backup of the scene graph the app drives. |
| `SaT.json.bak` | Prior backup of the scene-collection JSON. |

## Subdirectories

None.

## For AI Agents

### Working In This Directory

- **File-name contract:** the polled files are `${screen}.txt` with **no** `ss_` prefix (per `lib/constants.ts` `SCREEN_POSITIONS` and `obsClient.js` `clearTextFilesForStream`). The `ss_` prefix belongs to the OBS *input* names (`SOURCE_SWITCHER_NAMES`), not the files. Any legacy `ss_<position>.txt` files present are inert residue from an earlier naming scheme — they are not the live contract; do not document them as canonical.
- File **content** is webui-owned: `setActive` overwrites it; residue from prior events is harmless because the next write replaces it. The real correctness check is name-coverage between what the webui writes and the plugin's `sources` array, not file cleanliness.
- Writes must go through `lib/atomicWrite.ts` (`atomicWriteFileSync`), never raw `fs.writeFileSync`, so the polling plugin never reads a torn file.
- Treat `sources.db` as live runtime state; do not commit event data. Use `sources.template.db` as the clean baseline.

### Testing Requirements

- No tests live here. The write contract is covered by `lib/__tests__/atomicWrite.test.ts`; the schema by `lib/__tests__/database.test.ts`.

### Common Patterns

- Override the directory location with the `FILE_DIRECTORY` env var; `lib/database.ts` and `obsClient.js` both resolve paths from it (default `./files`).

## Dependencies

### Internal

- `lib/database.ts` (opens `sources.db`, ensures directory).
- `lib/atomicWrite.ts` + `app/api/setActive/route.ts` (write `${screen}.txt`).
- `lib/constants.ts` (`SCREEN_POSITIONS` → file basenames).
- `lib/obsClient.js` (`clearTextFilesForStream` reads/clears these files).

### External

- The upstream obs-source-switcher OBS plugin polls `${screen}.txt`.

<!-- MANUAL: notes below preserved on regeneration -->
