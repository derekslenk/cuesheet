<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# loadDriver/__tests__

## Purpose

Jest unit tests for the setActive load driver. They cover the round-robin picker, the even-spacing scheduler, response classification (including the `db_lock` bucket), percentile statistics, the SLO reporter gate, and the driver loop with an injected `FetchFn`.

## Key Files

| File | Description |
|---|---|
| `picker.test.ts` | Round-robin ordering and `expectedGroupName` derivation. |
| `schedule.test.ts` | `scheduleFireOffsets` even spacing, single-call case, and positive-input validation. |
| `classifyResult.test.ts` | Bucketing of 2xx / 4xx / db-lock / other-error / network-throw outcomes. |
| `stats.test.ts` | `percentile` / `computeStats` correctness, including empty-sample handling. |
| `reporter.test.ts` | `evaluateSLO` pass/fail at the p95 = 2000 ms and db_lock = 0 thresholds. |
| `runDriver.test.ts` | Full loop with a fake `FetchFn`: latency capture, bucket tallies, report assembly. |

## For AI Agents

### Working In This Directory

- One test file per source module; keep the mapping 1:1.

### Testing Requirements

- Run via repo-root `npm test`. Use a fake `FetchFn`; never hit a real webui.

### Common Patterns

- Deterministic schedules and injected fetch outcomes drive exact bucket/latency assertions.

## Dependencies

### Internal

- The sibling modules in `loadDriver/`

### External

- `jest`

<!-- MANUAL: notes below preserved on regeneration -->
