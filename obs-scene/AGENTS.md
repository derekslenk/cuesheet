<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# obs-scene

## Purpose
Reference artifacts for the OBS side of CueSheet: exported OBS **scene-collection
JSON** snapshots and example **source-switcher** `${screen}.txt` files. These are
reference/sample data (the canonical runtime switcher files live in the configured
`FILE_DIRECTORY`, default `files/`), useful for understanding the scene layout and
the plugin file contract, and for re-importing a known-good scene collection into
OBS.

## Key Files
| File | Description |
| --- | --- |
| `SaT.json` | Exported OBS scene collection (scenes, scene_order, group/source names like `<team>_<stream>_stream`). |
| `SaT_Summer_2026.json` | Season-specific scene-collection export (the season/year-aware variant). |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `source-switching/` | Sample per-screen `${screen}.txt` switcher files (see `source-switching/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- This is reference data, **not** runtime state — the live switcher files the
  obs-source-switcher plugin polls are written atomically into `FILE_DIRECTORY`
  (`config.js`), not here.
- Source names in the JSON follow the `<group_or_team>_<stream>_stream`
  convention (lowercased, spaces→`_`) — the same contract enforced across
  `app/api/*` and `lib`.
- Scene collections are season/year-aware; the table/scene naming mirrors
  `lib/constants` (`TABLE_NAMES`, `SCREEN_POSITIONS`) — don't hard-code a year.

### Testing Requirements
- None; static reference data.

## Dependencies
### Internal
- Mirrors the screen basenames in `lib/constants` (`SCREEN_POSITIONS`) and the
  file contract in `config.js`.
### External
- OBS Studio scene-collection format; the obs-source-switcher plugin.

<!-- MANUAL: notes below preserved on regeneration -->
