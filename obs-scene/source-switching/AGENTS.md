<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# source-switching

## Purpose
Sample per-screen `${screen}.txt` files illustrating the obs-source-switcher
plugin contract: each file is named for a screen position and contains a single
line — the active source name (`<group_or_team>_<stream>_stream`) — that the
plugin polls to decide which feed that screen shows. These are examples; the
runtime files live in `FILE_DIRECTORY`.

## Key Files
| File | Description |
| --- | --- |
| `large.txt`, `left.txt`, `right.txt`, `top_left.txt`, `top_right.txt`, `bottom_left.txt`, `bottom_right.txt` | One per screen position; basename = a `SCREEN_POSITIONS` key, contents = the active source name (no trailing newline). |

## For AI Agents
### Working In This Directory
- File **basenames** must match `lib/constants` `SCREEN_POSITIONS` exactly — the
  plugin matches on filename.
- Contents are a single source-name line, no torn writes: real writes go through
  `lib/atomicWrite` so the plugin never reads a partial file. Don't model these
  examples as multi-line.
- Reference only — switching at runtime is performed by `app/api/setActive`
  writing into `FILE_DIRECTORY`, not by editing these.

### Testing Requirements
- None; sample data.

## Dependencies
### Internal
- `lib/constants` (`SCREEN_POSITIONS`), `lib/atomicWrite`, `config.js`
  (`FILE_DIRECTORY`), `app/api/setActive`/`getActive`.
### External
- obs-source-switcher OBS plugin (file-polling contract).

<!-- MANUAL: notes below preserved on regeneration -->
