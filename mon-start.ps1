$ErrorActionPreference = 'SilentlyContinue'
Set-Location 'C:\Users\derek\dev\src\cuesheet'
$NODE = 'C:\Users\derek\scoop\apps\nodejs-lts-np\24.16.0\node.exe'
$env:STREAMLINK_PATH = 'C:\Users\derek\scoop\apps\streamlink\8.4.0-1\bin\streamlink.exe'
$env:FFMPEG_PATH = 'C:\Users\derek\scoop\apps\ffmpeg\8.1.1\bin\ffmpeg.exe'
$env:FILE_DIRECTORY = 'C:/OBS/source-switching'
if (-not (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*streamlink-supervisor*' })) {
  Remove-Item sup.out.log, sup.err.log -EA SilentlyContinue
  Start-Process -FilePath $NODE -ArgumentList @('node_modules\tsx\dist\cli.mjs', 'scripts/streamlink-supervisor/index.ts') -RedirectStandardOutput sup.out.log -RedirectStandardError sup.err.log -WindowStyle Hidden
}
if (-not (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*next*dev*' })) {
  Remove-Item dev.out.log, dev.err.log -EA SilentlyContinue
  Start-Process -FilePath $NODE -ArgumentList @('node_modules\next\dist\bin\next', 'dev', '-H', '0.0.0.0') -RedirectStandardOutput dev.out.log -RedirectStandardError dev.err.log -WindowStyle Hidden
}
