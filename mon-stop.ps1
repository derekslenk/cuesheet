# which: both (default) | sup | web. 'sup' also kills streamlink/ffmpeg children
# (note: that includes load-test generator ffmpeg — stop the supervisor BEFORE a
# load-test run, not during).
param([string]$which = 'both')
$ErrorActionPreference = 'SilentlyContinue'
if ($which -in 'both', 'sup') {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*streamlink-supervisor*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
  Get-Process streamlink, ffmpeg -EA SilentlyContinue | Stop-Process -Force
}
if ($which -in 'both', 'web') {
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
}
