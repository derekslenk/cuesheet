<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# convertBrowserToMedia/__tests__

## Purpose

Jest unit tests for the browser→media scene converter. They exercise the transform purity, the OBS-running detection across platforms, the timestamped-backup guarantees, and the orchestrator's refusal/dry-run paths using injected `ExecFn` and timestamps.

## Key Files

| File | Description |
|---|---|
| `transform.test.ts` | `convertSceneJson` output: converted entries, unmapped-source warnings, and the diff shape. |
| `obsRunningCheck.test.ts` | Windows `tasklist` parsing, macOS `pgrep` (exit-1-as-false), and the unsupported-platform throw. |
| `backup.test.ts` | `backupSceneFile` path layout, missing-source error, refusal to overwrite an existing backup dir, and `restoreFromBackup`. |
| `runConversion.test.ts` | Orchestration: empty-mapping error, OBS-running refusal, backup-then-write happy path, and `--dry-run` diff emission. |

## For AI Agents

### Working In This Directory

- One test file per source module; preserve the 1:1 mapping.

### Testing Requirements

- Run via repo-root `npm test`. Inject `ExecFn` and timestamp; do not depend on a real OBS process or wall-clock.

### Common Patterns

- Assert the refusal paths explicitly — they are the converter's safety contract.

## Dependencies

### Internal

- The sibling modules in `convertBrowserToMedia/`

### External

- `jest`

<!-- MANUAL: notes below preserved on regeneration -->
