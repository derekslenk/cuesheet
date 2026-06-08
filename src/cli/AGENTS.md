<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cuesheet CLI (`src/cli`)

## Purpose
Source for the unified **`cuesheet`** binary — one cross-platform executable
(built with `bun build --compile`) that replaces the project's old per-task
`.cmd`/`.ps1` launchers and `tsx` entry points. It launches the Next.js web UI,
runs the Streamlink supervisor **in-process**, manages process lifecycle, and
exposes the ops/test tools, on Windows, macOS, and Linux. See the root
[`README.md`](../../README.md) "Unified `cuesheet` binary" section for the
user-facing command surface and the plan at
`.omc/plans/unified-cuesheet-binary.md` for design rationale.

## Key Files
| File | Description |
| --- | --- |
| `main.ts` | Entry point. `commander` router wiring every subcommand. Bun-only modules are reached via literal dynamic import so `bun --compile` bundles them. Maps thrown `CliError` → `process.exitCode`. |
| `lib/types.ts` | Shared contracts: `CommandContext`, `ProcessRecord`, `RunState`, `HealthResult`, `ResolvedValue`, `Role`, `Which`. |
| `lib/exit.ts` | Exit-code constants (`EXIT.OK/GENERIC/USAGE/DEP_MISSING/PORT_IN_USE`) + `CliError`. |
| `lib/paths.ts` | THE authority for per-OS data dir, log dir, and `run-state.json` (override via `CUESHEET_HOME`). |
| `lib/env.ts` | Config resolver with precedence **flag → env → `.env.local` → per-OS default** (POSIX resolves streamlink/ffmpeg via PATH); returns `{value, source}` for `doctor`. |
| `lib/procState.ts` | Managed process records: atomic run-state writes, fingerprint/PID-reuse guard, process-group-first kill (POSIX negative-PGID / win32 `taskkill /T`). |
| `lib/health.ts` | Polls supervisor `:8080/health` + web UI `:3000`; never throws. |
| `lib/tui.ts` | Minimal terminal render core (screen-diff + raw-mode input + guaranteed cleanup). Logic-free — `commands/gui.ts` is the controller. |
| `lib/log.ts` | Per-process log files for detached `start` children; `tailLog` for `status --logs`. |
| `types/bun-shims.d.ts` | Surgical `bun:sqlite` + `*.html` + `import.meta.main` type shims so the bun-only supervisor type-checks without pulling all of bun-types globally. |
| `commands/*.ts` | One file per subcommand, each exporting `run(argv, ctx)`. |
| `commands/supervisor.bun.ts` | Bun-only: runs the supervisor in-process via the shared `scripts/streamlink-supervisor/runtime.ts` `startRuntime`. Excluded from the `tsc` gate (import attributes); still bundled by `bun --compile`. |

## Commands
`dev`, `sup` (alias `supervisor`), `watch`, `status`, `start`, `stop`,
`gui` (alias `dashboard`), `doctor`, and ops passthroughs `loadtest`,
`loaddriver`, `soak`, `clean-obs`, `measure-latency`, `verify-switcher-coverage`
(these forward argv to the refactored `run(argv)` exports in `scripts/`).

## For AI Agents
### Working In This Directory
- Build the binary: `npm run binary:build:{win,mac,linux}` (host: `npm run binary:build`). Smoke-test: `npm run binary:smoke`. Dev without compiling: `npm run cli:dev -- <command>` or `bun run src/cli/main.ts <command>`.
- Type-check via the repo gate `npm run type-check`; unit tests `npx jest src/cli`. CI matrix: `.github/workflows/cuesheet-binary.yml` (build + smoke per OS).
- Every command module exports `run(argv: string[], ctx: CommandContext)` and is wired in `main.ts`; `main.ts` is the only router — don't add ad-hoc entry points.
- Bun-only code (anything importing `bun:sqlite` or using `with { type: 'text' }`) goes in a `*.bun.ts` file reached by a literal dynamic import; keep it out of paths that the webui's `tsc` must check.
- Set `process.exitCode` (or throw `CliError`) rather than calling `process.exit()` deep in logic, so output flushes and the process unwinds cleanly.
- `stop` must only ever terminate processes recorded by `start` (fingerprint-validated) — never blanket-kill by name (that was the `mon-stop.ps1` bug).

### Testing Requirements
- Jest (jsdom via `next/jest`); tests under `src/cli/**/__tests__`. Pure libs (paths/env/exit/procState) and command record-selection logic are unit-tested; the AC6 isolation test in `commands/__tests__/stop.test.ts` spawns a real + an unrelated process and asserts only the tracked one dies.

## Dependencies
### Internal
- `commands/supervisor.bun.ts` reuses `scripts/streamlink-supervisor/runtime.ts`; ops commands reuse the `run(argv)` exports in `scripts/*`.
### External
- `commander` (router). Bun runtime APIs (`bun:sqlite`, asset embedding) for the compiled binary; `streamlink`/`ffmpeg` are spawned externally by the supervisor (unchanged).

<!-- MANUAL: notes below preserved on regeneration -->
