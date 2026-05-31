<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# obs-metrics-scraper/__tests__

## Purpose

A Node-side guard on the JSON Lines contract emitted by the PowerShell sampler. The test parses a representative fixture and asserts the record shape so downstream JSONL consumers can rely on the field names — including the `process.present=false` / fields-`null` case when OBS is not running.

## Key Files

| File | Description |
|---|---|
| `format.test.ts` | Reads `sample-output.fixture.jsonl`, parses each line, and asserts the `process` / `system` field shape (typed as `SampleProcess` / `SampleSystem`, nullable when absent). |
| `sample-output.fixture.jsonl` | Two representative scraped rows — one with `obs64.exe` present, one without — used as the parser fixture. |

## For AI Agents

### Working In This Directory

- This directory does not test PowerShell; it pins the JSONL schema. If the `.ps1` record shape changes, update both the fixture and the test.

### Testing Requirements

- Runs under repo-root Jest (`npm test`).

### Common Patterns

- Fixture-driven schema assertion (no live process sampling in the test).

## Dependencies

### Internal

- The fixture mirrors the output of `../scrape-obs-metrics.ps1`

### External

- `jest`; Node `fs` / `path`

<!-- MANUAL: notes below preserved on regeneration -->
