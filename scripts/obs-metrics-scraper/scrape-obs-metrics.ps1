<#
.SYNOPSIS
  OBS host process-metrics scraper for the Stream-a-Thon (Phase 3.2).

.DESCRIPTION
  Samples the obs64.exe process and system memory once every -IntervalSeconds
  (default 10) and appends one JSON line per sample to an hourly-rotated
  log file under -LogDir. Hourly rotation is filename-based: every sample's
  destination file is `obs-metrics-YYYY-MM-DD-HH.log`, so a new file is
  created at the top of every hour automatically without any extra task.

  Designed to be registered as a Windows Scheduled Task that auto-starts
  on boot and restarts on failure. See install-scheduled-task.ps1.

.PARAMETER LogDir
  Directory where obs-metrics-*.log files are written. Created if missing.

.PARAMETER IntervalSeconds
  Sampling interval in seconds. Default 10. Phase 3.2 acceptance target.

.PARAMETER RetainHours
  Delete obs-metrics-*.log files older than this many hours at the top of
  each hour. Default 168 = 7 days.

.PARAMETER ProcessName
  Process name to sample (without .exe). Default 'obs64'. Override for a
  test or sidecar scrape (e.g. 'obs-streaming').

.EXAMPLE
  pwsh -File .\scrape-obs-metrics.ps1 -LogDir C:\OBS\logs\obs-metrics

.NOTES
  Phase 3.2 acceptance: obs-metrics.log rolled hourly. The filename pattern
  encodes the hour, so each hour's worth of samples sits in its own file.
  No external rotation tool is required.
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$LogDir,

  [int]$IntervalSeconds = 10,
  [int]$RetainHours = 168,
  [string]$ProcessName = 'obs64'
)

$ErrorActionPreference = 'Continue'

if ($IntervalSeconds -lt 1) {
  throw "IntervalSeconds must be >= 1 (got $IntervalSeconds)"
}

if (-not (Test-Path -LiteralPath $LogDir)) {
  New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

function Get-HourlyLogPath {
  param([string]$Dir)
  $hourBucket = (Get-Date -Format 'yyyy-MM-dd-HH')
  return Join-Path $Dir ("obs-metrics-{0}.log" -f $hourBucket)
}

function Get-ObsProcessSample {
  param([string]$Name)
  # Get-Process throws when the process isn't running; SilentlyContinue
  # gives us $null and we record `present: false` instead.
  $proc = Get-Process -Name $Name -ErrorAction SilentlyContinue
  if (-not $proc) {
    return [pscustomobject]@{
      present = $false
      processId = $null
      workingSetBytes = $null
      privateMemoryBytes = $null
      virtualMemoryBytes = $null
      handleCount = $null
      threadCount = $null
      pageFaults = $null
      cpuTotalSeconds = $null
    }
  }
  # Multiple obs64 instances would be unusual; pick the highest-WS one if so.
  if ($proc -is [System.Array]) {
    $proc = $proc | Sort-Object WorkingSet64 -Descending | Select-Object -First 1
  }
  return [pscustomobject]@{
    present = $true
    processId = [int]$proc.Id
    workingSetBytes = [int64]$proc.WorkingSet64
    privateMemoryBytes = [int64]$proc.PrivateMemorySize64
    virtualMemoryBytes = [int64]$proc.VirtualMemorySize64
    handleCount = [int]$proc.HandleCount
    threadCount = $proc.Threads.Count
    pageFaults = [int64]$proc.PageFaults
    cpuTotalSeconds = [double]([Math]::Round($proc.TotalProcessorTime.TotalSeconds, 3))
  }
}

function Get-SystemMemorySample {
  $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
  if (-not $os) {
    return [pscustomobject]@{
      freePhysicalMemoryBytes = $null
      totalVisibleMemoryBytes = $null
      freePhysicalPercent = $null
    }
  }
  # Win32_OperatingSystem returns kilobytes; convert to bytes.
  $freeBytes = [int64]$os.FreePhysicalMemory * 1024
  $totalBytes = [int64]$os.TotalVisibleMemorySize * 1024
  $pct = if ($totalBytes -gt 0) { [Math]::Round(($freeBytes / $totalBytes) * 100, 2) } else { $null }
  return [pscustomobject]@{
    freePhysicalMemoryBytes = $freeBytes
    totalVisibleMemoryBytes = $totalBytes
    freePhysicalPercent = $pct
  }
}

function Remove-OldLogs {
  param([string]$Dir, [int]$RetainHours)
  if ($RetainHours -le 0) { return }
  $cutoff = (Get-Date).AddHours(-$RetainHours)
  Get-ChildItem -LiteralPath $Dir -Filter 'obs-metrics-*.log' -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTime -lt $cutoff } |
    ForEach-Object {
      try { Remove-Item -LiteralPath $_.FullName -Force } catch { }
    }
}

# Run cleanup once at startup, then again every hour boundary inside the loop.
$lastCleanupHour = -1

Write-Host "[obs-metrics] starting — process=$ProcessName interval=${IntervalSeconds}s logDir=$LogDir retain=${RetainHours}h"

while ($true) {
  $now = Get-Date
  $sample = [ordered]@{
    ts = $now.ToString('yyyy-MM-ddTHH:mm:ss.fffK')
    process = Get-ObsProcessSample -Name $ProcessName
    system = Get-SystemMemorySample
  }

  $line = ($sample | ConvertTo-Json -Compress -Depth 4)
  $logPath = Get-HourlyLogPath -Dir $LogDir

  try {
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
  } catch {
    Write-Warning "[obs-metrics] write failed for $logPath — $($_.Exception.Message)"
  }

  if ($now.Hour -ne $lastCleanupHour) {
    Remove-OldLogs -Dir $LogDir -RetainHours $RetainHours
    $lastCleanupHour = $now.Hour
  }

  Start-Sleep -Seconds $IntervalSeconds
}
