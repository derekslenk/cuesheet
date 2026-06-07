$ErrorActionPreference = "SilentlyContinue"
Write-Host ""
Write-Host "================ CueSheet status ================" -ForegroundColor Cyan
try {
  $h = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/health -TimeoutSec 4).Content | ConvertFrom-Json
  Write-Host ("SUPERVISOR : UP   - " + $h.streams.Count + " stream(s)   dashboard http://localhost:8080/") -ForegroundColor Green
  foreach ($s in $h.streams) { Write-Host ("             - " + $s.streamId + "  [" + $s.status + "]  " + $s.obsInputUrl + "  restarts=" + $s.restartCount) -ForegroundColor Gray }
} catch { Write-Host "SUPERVISOR : DOWN - nothing answering on :8080  (run run-sup.cmd)" -ForegroundColor Red }
Write-Host ""
try {
  $c = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/ -TimeoutSec 6).StatusCode
  Write-Host ("WEB UI     : UP   - HTTP " + $c + "   http://localhost:3000") -ForegroundColor Green
} catch { Write-Host "WEB UI     : DOWN - nothing answering on :3000  (run run-dev.cmd)" -ForegroundColor Red }
Write-Host ""
$sl = (Get-CimInstance Win32_Process -Filter "Name='streamlink.exe'").Count
$ff = (Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'").Count
Write-Host ("relay procs : streamlink=" + $sl + "  ffmpeg=" + $ff)
Write-Host "=================================================" -ForegroundColor Cyan
