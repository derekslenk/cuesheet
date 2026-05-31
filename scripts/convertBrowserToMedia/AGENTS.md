<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# convertBrowserToMedia

## Purpose

Converts `browser_source` inputs in an OBS scene-collection JSON into `ffmpeg_source` inputs pointing at the Streamlink supervisor's per-stream UDP endpoints (Phase 1.3 of the iter-3.4 plan). This is destructive to the scene file, so it runs under a strict safety contract: it refuses to run while OBS is open (OBS rewrites the scene JSON on shutdown and would silently clobber the edit), always writes a timestamped backup before touching the file, and supports `--dry-run` to emit a sibling `.diff.json` for operator review without changing anything. The per-source UDP mapping comes from a `--mapping-file` or a live supervisor's `/health` endpoint. The entry wrapper is `../convertBrowserToMedia.ts` (npm `convert:browser-to-media`).

## Key Files

| File | Description |
|---|---|
| `runConversion.ts` | Orchestrator: validates the mapping is non-empty, runs the OBS-running check (unless `--dry-run`), backs up the scene file, transforms the JSON, and writes the result (or the diff). Returns a `ConversionSummary` (changes, warnings, backup/diff paths). |
| `obsRunningCheck.ts` | `isObsRunning` — Windows (`tasklist` for `obs64.exe`) and macOS (`pgrep -x OBS`, treating exit 1 as "not running") detection via an injectable `ExecFn`; throws on unsupported platforms. |
| `backup.ts` | `backupSceneFile` (copies the scene file to `<backupRoot>/scenes.backup.<timestamp>/<basename>`, refusing to overwrite an existing backup dir) and `restoreFromBackup`. |
| `transform.ts` | `convertSceneJson` — pure JSON transform turning matched `browser_source` entries into `ffmpeg_source` using `buildFfmpegSourceSettings` from `lib/streamInputConfig`; produces changes, warnings (unmapped sources), and a structured diff. |
| `README.md` | Documents the safety contract, the two mapping sources, and example invocations. |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `__tests__/` | Jest unit tests for backup, OBS-running check, transform, and orchestration (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- Never weaken the safety contract: the OBS-running guard, the mandatory pre-write backup, and `--dry-run` are correctness features, not conveniences.
- `transform.ts` is pure (JSON in, JSON + diff out) and shares the `ffmpeg_source` settings shape with V2 `createStreamGroup` via `lib/streamInputConfig` — keep that single source of truth.
- The OBS-running check and file ops are injected (`ExecFn`, timestamp) so they can be faked in tests; keep new side effects injectable.

### Testing Requirements

- Each module has a `*.test.ts` in `__tests__/`. Run via repo-root `npm test`.
- Test the refusal paths (OBS running, empty mapping, pre-existing backup dir) — they are the contract.

### Common Patterns

- Injectable `ExecFn` and timestamp for deterministic, platform-independent tests.
- Pure transform separated from filesystem/process side effects.

## Dependencies

### Internal

- `lib/streamInputConfig` (`buildFfmpegSourceSettings`) — shared `ffmpeg_source` settings shape

### External

- Node builtins: `fs`, `path`, `child_process` (`exec` in the entry wrapper)
- Consumes the supervisor `/health` mapping (optional, via `--supervisor-url`)

<!-- MANUAL: notes below preserved on regeneration -->
