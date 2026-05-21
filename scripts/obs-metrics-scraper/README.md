# OBS Metrics Scraper (Phase 3.2)

Long-running PowerShell sampler for the OBS host. Records `obs64.exe`
working set, handles, threads, page faults, and CPU total, plus system
free/total physical memory, once every 10 seconds. Writes one JSON Lines
record per sample into an hourly-rotated file under `-LogDir`.

The acceptance bar from the Stream-a-Thon plan is:

> `obs-metrics.log` rolled hourly.

The rotation is filename-based — every sample's destination file is
`obs-metrics-YYYY-MM-DD-HH.log`, so the script transparently writes into
a new file at the top of every hour without a separate rotation task.

## Files

| File | Purpose |
|---|---|
| `scrape-obs-metrics.ps1` | Long-running sampler. Loops every `-IntervalSeconds`, writes JSONL, deletes log files older than `-RetainHours`. |
| `install-scheduled-task.ps1` | Registers the sampler as a Windows Scheduled Task that starts at boot and restarts on failure. Run from an elevated PowerShell session. |
| `__tests__/sample-output.fixture.jsonl` | A representative sample of two scraped rows (one with the process present, one without) used by the Node-side parser test. |
| `__tests__/format.test.ts` | Parses the fixture and asserts the JSONL shape — consumers depend on these field names. |

## JSONL format

One record per line, e.g.:

```json
{"ts":"2026-06-13T18:42:01.123-04:00","process":{"present":true,"processId":4112,"workingSetBytes":9836441600,"privateMemoryBytes":10120085504,"virtualMemoryBytes":34717216768,"handleCount":2418,"threadCount":162,"pageFaults":1452391,"cpuTotalSeconds":3812.461},"system":{"freePhysicalMemoryBytes":4123456000,"totalVisibleMemoryBytes":68719476736,"freePhysicalPercent":6.0}}
```

`process.present` is `false` (and the other process fields `null`) when
`obs64.exe` is not running at the sample instant. That keeps the row
shape stable so a downstream JSONL parser doesn't have to special-case
missing keys.

## Usage

### Run interactively (dev / smoke)

```powershell
pwsh -File scripts/obs-metrics-scraper/scrape-obs-metrics.ps1 `
  -LogDir 'C:\OBS\logs\obs-metrics' `
  -IntervalSeconds 10
```

### Install as a Scheduled Task (production)

```powershell
# From an elevated PowerShell session on the OBS host:
pwsh -File scripts/obs-metrics-scraper/install-scheduled-task.ps1
```

Customisations:

```powershell
pwsh -File install-scheduled-task.ps1 `
  -TaskName 'ObsMetricsScraper' `
  -User 'OBSHOST\operator' `
  -LogDir 'C:\OBS\logs\obs-metrics' `
  -IntervalSeconds 10 `
  -RetainHours 168
```

### Uninstall

```powershell
Stop-ScheduledTask -TaskName 'ObsMetricsScraper'
Unregister-ScheduledTask -TaskName 'ObsMetricsScraper' -Confirm:$false
```

### Tail the current hour's log

```powershell
Get-Content -Wait (Get-ChildItem 'C:\OBS\logs\obs-metrics\obs-metrics-*.log' `
  | Sort-Object LastWriteTime -Descending `
  | Select-Object -First 1).FullName
```

## Disk footprint

Each row is ~400 bytes. At 10-second sampling that's ~6 rows per minute
× 60 minutes = ~360 rows per hourly file ≈ ~144 KiB/h. A 7-day retention
(168 hours) costs ~24 MiB total. Adjust `-RetainHours` if disk is tight
or if you want a longer post-mortem window.

## What this does NOT cover

- **OBS-internal stats** (dropped frames, output bitrate). Those live in
  OBS's `GetStats` WebSocket reply; collecting them needs a small Node
  task with `obs-websocket-js`. The plan defers that to the event-day
  runbook (operator checks the OBS HUD directly).
- **Streamlink-side metrics.** The streamlink supervisor already exposes
  `/health` (Phase 3.1 dashboard) for that surface.
- **Cross-host export.** Logs stay on the OBS host. If you need them on
  the dev box, sync with `scp` or the existing `capturePhase05Snapshot.sh`
  pattern.
