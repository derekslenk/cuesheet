Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = 'SilentlyContinue'
Set-Location $PSScriptRoot

$NODE = 'C:\Users\derek\scoop\apps\nodejs-lts-np\24.16.0\node.exe'
$SL   = 'C:\Users\derek\scoop\apps\streamlink\8.4.0-1\bin\streamlink.exe'
$FF   = 'C:\Users\derek\scoop\apps\ffmpeg\8.1.1\bin\ffmpeg.exe'
$FD   = 'C:/OBS/source-switching'

$green = [System.Drawing.Color]::FromArgb(80, 220, 120)
$red   = [System.Drawing.Color]::FromArgb(235, 90, 90)
$fg    = [System.Drawing.Color]::FromArgb(220, 220, 225)
$bg    = [System.Drawing.Color]::FromArgb(24, 24, 28)
$mono  = New-Object System.Drawing.Font('Consolas', 11)
$monoB = New-Object System.Drawing.Font('Consolas', 11, [System.Drawing.FontStyle]::Bold)

function SupProc { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*streamlink-supervisor*' } }
function DevProc { Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' } }
function StartSup {
  if (SupProc) { return }
  $env:STREAMLINK_PATH = $SL; $env:FFMPEG_PATH = $FF; $env:FILE_DIRECTORY = $FD
  Remove-Item sup.out.log, sup.err.log -EA SilentlyContinue
  Start-Process -FilePath $NODE -ArgumentList @('node_modules\tsx\dist\cli.mjs', 'scripts/streamlink-supervisor/index.ts') -RedirectStandardOutput sup.out.log -RedirectStandardError sup.err.log -WindowStyle Hidden
}
function StartDev {
  if (DevProc) { return }
  $env:FFMPEG_PATH = $FF; $env:FILE_DIRECTORY = $FD
  Remove-Item dev.out.log, dev.err.log -EA SilentlyContinue
  Start-Process -FilePath $NODE -ArgumentList @('node_modules\next\dist\bin\next', 'dev', '-H', '0.0.0.0') -RedirectStandardOutput dev.out.log -RedirectStandardError dev.err.log -WindowStyle Hidden
}
function StopAll {
  SupProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
  DevProc | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -EA SilentlyContinue }
  Get-Process streamlink, ffmpeg -EA SilentlyContinue | Stop-Process -Force -EA SilentlyContinue
}

$form = New-Object System.Windows.Forms.Form
$form.Text = 'CueSheet'
$form.Size = New-Object System.Drawing.Size(470, 360)
$form.StartPosition = 'CenterScreen'
$form.BackColor = $bg
$form.FormBorderStyle = 'FixedSingle'
$form.MaximizeBox = $false

$lblSup = New-Object System.Windows.Forms.Label
$lblSup.Location = New-Object System.Drawing.Point(18, 14); $lblSup.AutoSize = $true; $lblSup.Font = $monoB; $form.Controls.Add($lblSup)
$lblWeb = New-Object System.Windows.Forms.Label
$lblWeb.Location = New-Object System.Drawing.Point(18, 40); $lblWeb.AutoSize = $true; $lblWeb.Font = $monoB; $form.Controls.Add($lblWeb)
$lblRelay = New-Object System.Windows.Forms.Label
$lblRelay.Location = New-Object System.Drawing.Point(18, 66); $lblRelay.AutoSize = $true; $lblRelay.Font = $mono; $lblRelay.ForeColor = $fg; $form.Controls.Add($lblRelay)

$lst = New-Object System.Windows.Forms.ListBox
$lst.Location = New-Object System.Drawing.Point(18, 92); $lst.Size = New-Object System.Drawing.Size(420, 150)
$lst.Font = $mono; $lst.BackColor = [System.Drawing.Color]::FromArgb(16,16,20); $lst.ForeColor = $fg; $lst.BorderStyle = 'FixedSingle'; $form.Controls.Add($lst)

function MakeBtn($text, $x) {
  $b = New-Object System.Windows.Forms.Button
  $b.Text = $text; $b.Location = New-Object System.Drawing.Point($x, 256); $b.Size = New-Object System.Drawing.Size(100, 30)
  $b.FlatStyle = 'Flat'; $b.ForeColor = $fg; $b.Font = $mono; $form.Controls.Add($b); return $b
}
$btnStart = MakeBtn 'Start' 18
$btnStop  = MakeBtn 'Stop'  124
$btnDash  = MakeBtn 'Dashboard' 230
$btnWeb   = MakeBtn 'Web UI' 336

$btnStart.Add_Click({ StartSup; StartDev; UpdateUi })
$btnStop.Add_Click({ StopAll; UpdateUi })
$btnDash.Add_Click({ Start-Process 'http://localhost:8080/' })
$btnWeb.Add_Click({ Start-Process 'http://localhost:3000/' })

function UpdateUi {
  try { $h = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:8080/health -TimeoutSec 2).Content | ConvertFrom-Json } catch { $h = $null }
  try { $code = (Invoke-WebRequest -UseBasicParsing http://127.0.0.1:3000/ -TimeoutSec 2).StatusCode } catch { $code = $null }
  if ($h) { $lblSup.Text = 'SUPERVISOR  UP   ' + $h.streams.Count + ' stream(s)'; $lblSup.ForeColor = $green }
  else    { $lblSup.Text = 'SUPERVISOR  DOWN'; $lblSup.ForeColor = $red }
  if ($null -ne $code) { $lblWeb.Text = 'WEB UI      UP   HTTP ' + $code; $lblWeb.ForeColor = $green }
  else    { $lblWeb.Text = 'WEB UI      DOWN'; $lblWeb.ForeColor = $red }
  $sl = (Get-CimInstance Win32_Process -Filter "Name='streamlink.exe'").Count
  $ff = (Get-CimInstance Win32_Process -Filter "Name='ffmpeg.exe'").Count
  $lblRelay.Text = 'relay procs: streamlink=' + $sl + '  ffmpeg=' + $ff
  $lst.BeginUpdate(); $lst.Items.Clear()
  if ($h) { foreach ($s in $h.streams) { [void]$lst.Items.Add($s.streamId + '  [' + $s.status + ']  ' + $s.obsInputUrl + '  r=' + $s.restartCount) } }
  $lst.EndUpdate()
}

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.Add_Tick({ UpdateUi })
$timer.Start()
UpdateUi
[System.Windows.Forms.Application]::EnableVisualStyles()
[void][System.Windows.Forms.Application]::Run($form)
