<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cli libs (`src/cli/lib`)

## Purpose
Pure(ish), unit-tested support libraries for the `cuesheet` binary. Commands in
`../commands` compose these; logic lives here so it can be tested without
spawning the full CLI. Authorities for paths, env resolution, process state, and
rendering all live in this directory.

## Key Files
| File | Description |
| --- | --- |
| `types.ts` | Shared contracts: `CommandContext`, `ProcessRecord`, `RunState`, `HealthResult`, `StreamStatus`, `Role`, `Which`. |
| `exit.ts` | Exit-code constants (`EXIT.OK/GENERIC/USAGE/DEP_MISSING/PORT_IN_USE`) + `CliError`. |
| `paths.ts` | THE authority for per-OS data dir, log dir, and `run-state.json` (override via `CUESHEET_HOME`). |
| `env.ts` | Config resolver, precedence **flag → env → `.env.local` → per-OS default** (POSIX resolves streamlink/ffmpeg via PATH); returns `{value, source}` for `doctor`. Also `loadProjectEnvFiles`/`findProjectRoot`. |
| `supervisorEnv.ts` | Side-effect bootstrap: calls `loadProjectEnvFiles(process.env)` so `lib/constants` sees the project `.env.local` (and the right `EVENT_KEY`) before module-eval. MUST be the first import in `commands/supervisor.bun.ts`. |
| `procState.ts` | Managed process records: atomic run-state writes, creation-time identity guard (PID-reuse protection via `isSafeToKill`; cmdFingerprint is diagnostic metadata only), process-group-first kill (POSIX negative-PGID / win32 `taskkill /T`). |
| `health.ts` | Polls supervisor `:8080/health` + webui `:3000`; never throws. Attaches stream data to the `sup` `HealthResult`. |
| `streamsView.ts` | Pure formatting (no I/O) of the supervised-stream list — shared by `status`, `watch`, `gui` so all render identically; health-colored rows + running-count header. |
| `tui.ts` | Minimal terminal render core (screen-diff + raw-mode input + guaranteed cleanup). Logic-free — `commands/gui.ts` is the controller. |
| `log.ts` | Per-process log files for detached `start` children; `tailLog` for `status --logs`. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `__tests__` | Jest unit tests for the pure libs (see `__tests__/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- Keep these libs free of command/router concerns — `../commands` and
  `../main.ts` compose them. `tui.ts` and `streamsView.ts` are render-only (no
  I/O); don't push process logic into them.
- `paths.ts` is the single source for data/log/run-state locations; never derive
  those paths elsewhere.
- `env.ts` must keep returning `{value, source}` so `doctor` can show provenance;
  preserve the flag → env → `.env.local` → default precedence.
- `procState` kill must stay process-group-first and creation-time-guarded
  against PID reuse (`isSafeToKill`) — the isolation guarantee `stop` depends
  on. The cmdFingerprint field is diagnostic metadata; do not use it as a kill
  guard.
- Modules use `.js` import specifiers (ESM/bun); keep that extension convention.

### Testing Requirements
- `npx jest src/cli`. Pure libs (paths/env/exit/procState/health/streamsView/tui)
  are directly unit-tested in `__tests__`.

## Dependencies
### Internal
- Consumed by `../commands/*` and `../main.ts`; `supervisorEnv` bridges to
  `lib/constants` at the repo root.
### External
- Node stdlib (`fs`, `os`, `path`, `child_process`, `http`). No heavy deps —
  these stay portable for `bun --compile`.

<!-- MANUAL: notes below preserved on regeneration -->
