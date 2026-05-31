<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# atomicWriteSoak

## Purpose

Phase 2.2 soak harness that proves which file-write strategy CueSheet's `setActive` should use for the `${screen}.txt` switcher files. It runs a writer (default 1 Hz) and a much faster reader (default 60 Hz) against a single target file under one of two strategies — `write` (`fs.writeFileSync`, the original behavior) or `rename` (`writeFileSync(tmp)` then `renameSync(tmp, target)`) — and classifies every read against a sliding set of recently-written values. Any read outside that set (empty file, ENOENT, wrong bytes, read error) is a **torn read**. Acceptance: zero torn reads in the chosen strategy over a 30-min run. The logic has both a `.ts` port and an `.mjs` mirror so the soak can run on the Windows OBS host without `tsx` (Phase 2.2 F1). Entry wrappers are `../atomicWriteSoak.ts` (npm `soak:atomic-write`) and `../atomicWriteSoak.mjs` (npm `soak:atomic-write:mjs`).

## Key Files

| File | Description |
|---|---|
| `strategies.ts` / `strategies.mjs` | `writeStrategy` (direct `writeFileSync`) and `renameStrategy` (temp-file + atomic rename); `pickStrategy`, `isValidStrategy`, `strategyOutputBase`. |
| `classifyRead.ts` / `classifyRead.mjs` | `classifyRead` — buckets a read into `ok` / `empty` / `enoent` / `mismatch` / `read_error`; `ok` only when content is in the writer's in-flight valid set. ENOENT is bucketed separately (a real defect under `rename`, since rename is atomic). |
| `runSoak.ts` / `runSoak.mjs` | `runSoak` — drives the writer/reader timers, tallies buckets, records the first failures with timestamps, and returns a `SoakReport`; `defaultReadFile` is the real-fs reader. Side effects (read, clock, timers) are injected via `SoakDeps`. |
| `reporter.ts` / `reporter.mjs` | `formatConsoleReport` — writes/reads-per-second, per-bucket counts, PASS/FAIL verdict, and a sample of the first failures. |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `__tests__/` | Jest unit tests (`.ts`) for strategies, read classification, the soak loop, and the reporter (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- The `.ts` and `.mjs` files are intentional parallel ports — any logic change to one MUST be mirrored in the other; the `.mjs` exists solely to run without `tsx`.
- `runSoak` injects `readFile`, `now`, and the interval/timeout functions (`SoakDeps`) so the loop is deterministic in tests; keep new side effects injected.
- The whole point is detecting torn reads; do not relax the `ok` criterion (content must be in the in-flight valid set).

### Testing Requirements

- Tests are `.ts` only and run via repo-root `npm test`. They exercise the `.ts` port; keep the `.mjs` mirror in sync by hand.

### Common Patterns

- Injected fake clock/timers/reader for deterministic soak runs.
- Exit-code gate: 0 if zero torn reads, 1 otherwise.

## Dependencies

### Internal

- None (self-contained; consumed only by the entry wrappers)

### External

- Node builtins: `fs`, `path`

<!-- MANUAL: notes below preserved on regeneration -->
