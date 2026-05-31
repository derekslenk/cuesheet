<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# streamlink-supervisor/__tests__

## Purpose

Jest unit tests for the Streamlink supervisor modules. Each test injects fakes (spawn function, clock, in-memory DB, snapshot provider) so the supervisor's spawning, port allocation, restart escalation, log rotation, and `/health` behavior are verified without real child processes, sockets, or files.

## Key Files

| File | Description |
|---|---|
| `commands.test.ts` | Verifies `buildStreamlinkCmd` / `buildFfmpegRelayCmd` arg construction and the port range guard. |
| `portAllocator.test.ts` | Sequential allocation, release/reuse, and `PortExhaustedError` on exhaustion. |
| `restartTracker.test.ts` | Sliding-window record/prune and the 3-in-30s `shouldEscalate` boundary. |
| `streamPipeline.test.ts` | Spawn wiring (streamlink→ffmpeg pipe), status transitions, `onExit`/`onStderr` callbacks via a fake `SpawnFn`. |
| `supervisor.test.ts` | End-to-end supervisor behavior: spawn-per-spec, restart vs escalate, state reporting. |
| `runtime.test.ts` | `startRuntime` wiring: spec load → loggers → supervisor → health server → `shutdown`. |
| `healthServer.test.ts` | `/`, `/dashboard`, `/health` routing, method guards, and JSON snapshot shape. |
| `streamSpecsLoader.test.ts` | `loadStreamSpecs` row filtering and the `SAFE_TABLE_NAME` rejection path. |
| `fileLogger.test.ts` | Size-based rotation and `retain` pruning. |

## For AI Agents

### Working In This Directory

- One test file per source module; keep that 1:1 mapping when adding modules.

### Testing Requirements

- Run with repo-root `npm test` (Jest). Inject fakes; never spawn real `streamlink`/`ffmpeg` or open real sockets here.

### Common Patterns

- Fake `SpawnFn` returning a `ChildProcessLike`; injected `now()` clock for deterministic window tests.

## Dependencies

### Internal

- The sibling modules in `streamlink-supervisor/`

### External

- `jest`

<!-- MANUAL: notes below preserved on regeneration -->
