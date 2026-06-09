<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cli commands tests (`src/cli/commands/__tests__`)

## Purpose
Jest tests for the lifecycle commands `start` and `stop` — the highest-risk
surface, since they spawn and kill OS processes.

## Key Files
| File | Description |
| --- | --- |
| `start.test.ts` | Asserts `start` records spawned children correctly (which/role, fingerprint, log paths) and respects `--which both\|sup\|web`. |
| `stop.test.ts` | Record-selection + the AC6 isolation guarantee: spawns a real tracked process **and** an unrelated process, then asserts `stop` terminates only the tracked one — never a blanket kill-by-name. |

## For AI Agents
### Working In This Directory
- The isolation test is the contract that prevents regressing to the
  `mon-stop.ps1` blanket-kill bug — keep it real (actual spawned processes), not
  mocked away.
- Run via `npx jest src/cli`; uses the repo's `next/jest` jsdom config.

### Testing Requirements
- These ARE the tests. Add a case here whenever `start`/`stop` record shape,
  fingerprinting, or kill semantics change.

## Dependencies
### Internal
- `../start.ts`, `../stop.ts`, `../../lib/procState.ts`, `../../lib/paths.ts`.
### External
- `jest`; Node `child_process` (real process spawning).

<!-- MANUAL: notes below preserved on regeneration -->
