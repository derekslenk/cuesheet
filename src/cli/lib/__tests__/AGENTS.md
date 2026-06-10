<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cli lib tests (`src/cli/lib/__tests__`)

## Purpose
Jest unit tests for the pure `src/cli/lib` support libraries — the layer that
must be correct independent of the full CLI wiring.

## Key Files
| File | Description |
| --- | --- |
| `env.test.ts` | Resolution precedence (flag → env → `.env.local` → per-OS default) and `{value, source}` provenance used by `doctor`. |
| `paths.test.ts` | Per-OS data/log/run-state paths and `CUESHEET_HOME` override. |
| `procState.test.ts` | Atomic run-state writes, creation-time identity guard (PID-reuse protection), kill targeting. |
| `health.test.ts` | Supervisor/webui polling; never-throws contract. |
| `streamsView.test.ts` | Stream-list summarization + formatting (counts, health coloring, clipping). |
| `tui.test.ts` | Render core (screen-diff / cleanup) sanity. |
| `exit.test.ts` | Exit-code constants + `CliError` mapping. |

## For AI Agents
### Working In This Directory
- Test pure logic here, not process orchestration — lifecycle (`start`/`stop`)
  integration lives in `../../commands/__tests__`.
- Run via `npx jest src/cli`; uses the repo `next/jest` jsdom config.

### Testing Requirements
- Add/extend a test here whenever the corresponding `../<lib>.ts` contract
  changes (especially `env` precedence and `procState` kill semantics).

## Dependencies
### Internal
- The sibling libs under `../` (`env`, `paths`, `procState`, `health`,
  `streamsView`, `tui`, `exit`).
### External
- `jest`; Node stdlib.

<!-- MANUAL: notes below preserved on regeneration -->
