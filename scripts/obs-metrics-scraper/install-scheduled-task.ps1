<#
.SYNOPSIS
  Register scrape-obs-metrics.ps1 as a Windows Scheduled Task (Phase 3.2).

.DESCRIPTION
  Creates a task named -TaskName that starts on boot and restarts itself
  if the script exits. PowerShell is launched with -NoProfile -ExecutionPolicy
  Bypass so the task survives policy changes to user PowerShell profiles.

.PARAMETER ScriptPath
  Absolute path to scrape-obs-metrics.ps1. Defaults to the sibling script.

.PARAMETER LogDir
  Where the metrics .log files are written. Default C:\OBS\logs\obs-metrics.

.PARAMETER TaskName
  Scheduled-task name. Default 'ObsMetricsScraper'.

.PARAMETER User
  User principal for the task. Default 'SYSTEM' so it survives logoffs.
  Use the operator account if you need user-context permissions (e.g.,
  reading per-user OBS settings).

.PARAMETER IntervalSeconds
  Forwarded to the script. Default 10.

.EXAMPLE
  pwsh -File .\install-scheduled-task.ps1
  pwsh -File .\install-scheduled-task.ps1 -User 'OBSHOST\operator'

.NOTES
  Run from an elevated PowerShell session. The task itself runs at the
  configured -User principal regardless of the install shell's user.
#>
[CmdletBinding()]
param(
  [string]$ScriptPath = (Join-Path $PSScriptRoot 'scrape-obs-metrics.ps1'),
  [string]$LogDir = 'C:\OBS\logs\obs-metrics',
  [string]$TaskName = 'ObsMetricsScraper',
  [string]$User = 'SYSTEM',
  [int]$IntervalSeconds = 10,
  [int]$RetainHours = 168
)

if (-not (Test-Path -LiteralPath $ScriptPath)) {
  throw "ScriptPath does not exist: $ScriptPath"
}

$pwshCmd = Get-Command pwsh -ErrorAction SilentlyContinue
if ($pwshCmd) {
  $pwshExe = $pwshCmd.Source
} else {
  $pwshExe = (Get-Command powershell.exe).Source
}

$arguments = @(
  '-NoProfile',
  '-ExecutionPolicy', 'Bypass',
  '-File', "`"$ScriptPath`"",
  '-LogDir', "`"$LogDir`"",
  '-IntervalSeconds', $IntervalSeconds,
  '-RetainHours', $RetainHours
) -join ' '

$action = New-ScheduledTaskAction -Execute $pwshExe -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtStartup
# ExecutionTimeLimit of zero means "no limit"; the scraper is meant to
# run indefinitely until the task is stopped or the host reboots.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 0)

if ($User -eq 'SYSTEM') {
  $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
} else {
  $principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Highest
}

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Write-Host "[obs-metrics] removing existing task $TaskName"
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description 'Stream-a-Thon Phase 3.2 — sample obs64.exe + system memory every 10s, hourly-rotated JSONL.' | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host "[obs-metrics] task $TaskName installed and started"
Write-Host "[obs-metrics]   ScriptPath: $ScriptPath"
Write-Host "[obs-metrics]   LogDir:     $LogDir"
Write-Host "[obs-metrics]   User:       $User"
Write-Host "[obs-metrics]   Interval:   ${IntervalSeconds}s"
Write-Host "[obs-metrics] tail latest log: Get-Content -Wait (Get-ChildItem '$LogDir\obs-metrics-*.log' | Sort LastWriteTime -Descending | Select -First 1).FullName"
