<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# obs-metrics-scraper

## Purpose

Phase 3.2 process-metrics logger for the Windows OBS host. A long-running PowerShell sampler records `obs64.exe` working set, private/virtual memory, handle/thread counts, page faults, and total CPU seconds, plus system free/total physical memory, once every 10 s (default), and appends one JSON Lines record per sample to an hourly-rotated log file. Rotation is filename-based — each sample's destination is `obs-metrics-YYYY-MM-DD-HH.log`, so a new file is created at the top of every hour with no separate rotation task. When `obs64.exe` is not running, the row's `process.present` is `false` and the process fields are `null`, keeping the JSONL shape stable for downstream parsers. A companion script registers the sampler as a Windows Scheduled Task that starts at boot and restarts on failure.

## Key Files

| File | Description |
|---|---|
| `scrape-obs-metrics.ps1` | The sampler. Loops every `-IntervalSeconds`, writes one JSONL record per sample to `obs-metrics-YYYY-MM-DD-HH.log` under `-LogDir`, and deletes log files older than `-RetainHours` (default 168 = 7 days). Params: `-LogDir`, `-IntervalSeconds`, `-RetainHours`, `-ProcessName` (default `obs64`). |
| `install-scheduled-task.ps1` | Registers the sampler as a Windows Scheduled Task (default `ObsMetricsScraper`) running at boot, restarting on failure, launched `-NoProfile -ExecutionPolicy Bypass`. Run from an elevated PowerShell session. Params include `-ScriptPath`, `-LogDir`, `-TaskName`, `-User` (default `SYSTEM`), `-IntervalSeconds`. |
| `README.md` | Acceptance bar, the JSONL record format, and run/install instructions. |

## Subdirectories

| Subdirectory | Description |
|---|---|
| `__tests__/` | Node-side parser test + a JSONL fixture asserting the record shape (see `__tests__/AGENTS.md`) |

## For AI Agents

### Working In This Directory

- The two scripts are PowerShell; the only Node code is the parser test, which guards the JSONL field names that downstream consumers depend on. If you change the emitted record shape in the `.ps1`, update the fixture and test together.
- Hourly rotation is achieved purely by the filename pattern — don't add a separate rotation mechanism.
- Keep the `process.present=false` / fields-`null` contract so consumers never have to special-case missing keys.

### Testing Requirements

- `format.test.ts` runs under the repo-root Jest (`npm test`) and parses `sample-output.fixture.jsonl`; the PowerShell scripts themselves are validated operationally on the Windows host.

### Common Patterns

- One JSON object per line; stable schema regardless of whether OBS is running.
- Scheduled-task install isolated from the sampler so the sampler can also be run interactively for smoke tests.

## Dependencies

### Internal

- None

### External

- PowerShell / `pwsh` and Windows Task Scheduler (host-side)
- `jest` (parser test only)

<!-- MANUAL: notes below preserved on regeneration -->
