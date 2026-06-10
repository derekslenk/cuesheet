<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cli commands (`src/cli/commands`)

## Purpose
One file per `cuesheet` subcommand. Each module exports
`run(argv: string[], ctx: CommandContext)` and is wired into the `commander`
router in `../main.ts` — the only router; don't add ad-hoc entry points.
Substantive commands manage process lifecycle and the TUI; the small ops files
are thin passthroughs that forward `argv` to the refactored `run(argv)` exports
under `scripts/`.

## Key Files
| File | Description |
| --- | --- |
| `dev.ts` | `cuesheet dev` — runs the Next.js dev server (+ optionally the supervisor) in the foreground. |
| `supervisor.bun.ts` | Bun-only: runs the Streamlink supervisor **in-process** via `scripts/streamlink-supervisor/runtime.ts` `startRuntime`. Excluded from the `tsc` gate; bundled by `bun --compile`. Imports `../lib/supervisorEnv` FIRST. |
| `start.ts` | `cuesheet start --which both\|sup\|web` — spawns detached, log-redirected children and records them via `lib/procState`. |
| `stop.ts` | `cuesheet stop` — terminates **only** processes recorded by `start` (identity verified by OS creation time via `isSafeToKill`); never blanket-kills by name. |
| `status.ts` | `cuesheet status [--logs]` — health of supervisor + webui via `lib/health`, stream list via `lib/streamsView`, tails logs via `lib/log`. |
| `watch.ts` | `cuesheet watch` — periodic non-TTY status refresh. |
| `gui.ts` | `cuesheet gui` (alias `dashboard`) — interactive TUI controller built on the logic-free `lib/tui` render core. |
| `doctor.ts` | `cuesheet doctor` — prints each resolved streamlink/ffmpeg/port/dir value and its source (`lib/env`), pre-event preflight. |
| `cleanObs.ts` | Passthrough → `scripts/cleanObsCollection.ts` (`clean-obs`). |
| `loadtest.ts` | Passthrough → `scripts/loadtest/index.ts`. |
| `loaddriver.ts` | Passthrough → `scripts/loadDriver`. |
| `measureLatency.ts` | Passthrough → latency script. |
| `soak.ts` | Passthrough → atomic-write soak script. |
| `verifySwitcherCoverage.ts` | Passthrough → switcher-coverage verifier. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `__tests__` | Jest tests for `start`/`stop` record selection + isolation (see `__tests__/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- Every command exports `run(argv, ctx)` and is registered in `../main.ts`.
- Set `process.exitCode` or throw `CliError` (`../lib/exit`) instead of calling
  `process.exit()` deep in logic, so output flushes and the process unwinds.
- Bun-only code (imports `bun:sqlite`, `with { type: 'text' }`) lives in a
  `*.bun.ts` file reached by a literal dynamic import — keep it out of paths the
  webui `tsc` must check.
- `stop` must only kill `start`-recorded processes whose identity is verified by
  OS creation time (`isSafeToKill`) — never by name (the `mon-stop.ps1` bug).
- Ops passthroughs stay one-liners; put real logic in the underlying `scripts/`
  module's `run(argv)` export.

### Testing Requirements
- `npx jest src/cli`. `start`/`stop` selection logic is unit-tested; the AC6
  isolation test in `__tests__/stop.test.ts` spawns a real + an unrelated
  process and asserts only the tracked one dies.

## Dependencies
### Internal
- `../lib/*` (`types`, `exit`, `paths`, `env`, `procState`, `health`, `tui`,
  `log`, `streamsView`, `supervisorEnv`); `scripts/*` `run(argv)` exports;
  `scripts/streamlink-supervisor/runtime.ts`.
### External
- `commander` (via `main.ts`); Bun runtime APIs in `supervisor.bun.ts`.

<!-- MANUAL: notes below preserved on regeneration -->
