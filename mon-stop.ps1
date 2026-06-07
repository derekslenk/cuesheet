$ErrorActionPreference = 'SilentlyContinue'
Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*streamlink-supervisor*' -or $_.CommandLine -like '*next*dev*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
Get-Process streamlink, ffmpeg -EA SilentlyContinue | Stop-Process -Force
