param([int]$IntervalSec = 2, [switch]$Once)
$ErrorActionPreference = 'SilentlyContinue'
function Render {
  $sup = $null
  try { $sup = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/health -TimeoutSec 3).Content | ConvertFrom-Json } catch {}
  $code = $null
  try { $code = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/ -TimeoutSec 3).StatusCode } catch {}
  $sl = (Get-CimInstance Win32_Process -Filter "Name='streamlink.exe'").Count
  $ff = (Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'").Count
  Clear-Host
  Write-Host ('  CueSheet monitor      ' + (Get-Date -Format 'HH:mm:ss') + '      refresh ' + $IntervalSec + 's   (Ctrl+C to quit)') -ForegroundColor Cyan
  Write-Host ('  ' + ('-' * 64)) -ForegroundColor DarkGray
  if ($sup) {
    Write-Host ('  SUPERVISOR  UP     ' + $sup.streams.Count + ' stream(s)     http://localhost:8080/') -ForegroundColor Green
    foreach ($s in $sup.streams) {
      $col = if ($s.status -eq 'running') { 'Gray' } else { 'Yellow' }
      Write-Host ('       ' + ($s.streamId.PadRight(26)) + '[' + $s.status + ']  ' + $s.obsInputUrl + '  restarts=' + $s.restartCount) -ForegroundColor $col
    }
  } else {
    Write-Host '  SUPERVISOR  DOWN   (:8080 not answering -- run-sup.cmd)' -ForegroundColor Red
  }
  Write-Host ''
  if ($null -ne $code) { Write-Host ('  WEB UI      UP     HTTP ' + $code + '     http://localhost:3000') -ForegroundColor Green }
  else { Write-Host '  WEB UI      DOWN   (:3000 not answering -- run-dev.cmd)' -ForegroundColor Red }
  Write-Host ''
  Write-Host ('  relay procs: streamlink=' + $sl + '   ffmpeg=' + $ff) -ForegroundColor DarkGray
}
if ($Once) { Render; return }
while ($true) { Render; Start-Sleep -Seconds $IntervalSec }
