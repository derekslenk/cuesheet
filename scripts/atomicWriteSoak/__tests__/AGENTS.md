<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# atomicWriteSoak/__tests__

## Purpose

Jest unit tests (TypeScript) for the atomic-write soak harness. They verify the two write strategies, read classification into the torn-read buckets, the soak loop's tallying/failure-capture behavior with injected timers and reader, and the console reporter. Tests target the `.ts` port; the `.mjs` mirror is kept in sync manually.

## Key Files

| File | Description |
|---|---|
| `strategies.test.ts` | `writeStrategy` vs `renameStrategy` behavior and the `pickStrategy` / `isValidStrategy` selectors. |
| `classifyRead.test.ts` | Bucketing of in-set content (`ok`), empty file, ENOENT, mismatched bytes, and read errors. |
| `runSoak.test.ts` | The soak loop with injected clock/timers/reader: bucket tallies, first-failure capture, PASS/FAIL outcome. |
| `reporter.test.ts` | `formatConsoleReport` rates, per-bucket counts, and verdict formatting. |

## For AI Agents

### Working In This Directory

- One test file per source module; the suite covers the `.ts` port only.

### Testing Requirements

- Run via repo-root `npm test`. Inject the fake clock/timers/reader; never use real wall-clock timing in the loop tests.

### Common Patterns

- Deterministic torn-read scenarios constructed by feeding a scripted reader into `runSoak`.

## Dependencies

### Internal

- The sibling `.ts` modules in `atomicWriteSoak/`

### External

- `jest`

<!-- MANUAL: notes below preserved on regeneration -->
