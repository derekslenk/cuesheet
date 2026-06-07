@echo off
title CueSheet WebUI
cd /d C:\Users\derek\dev\src\cuesheet
set "STREAMLINK_PATH=C:\Users\derek\scoop\apps\streamlink\8.4.0-1\bin\streamlink.exe"
set "FFMPEG_PATH=C:\Users\derek\scoop\apps\ffmpeg\8.1.1\bin\ffmpeg.exe"
set "FILE_DIRECTORY=C:/OBS/source-switching"
echo ============================================================
echo  CueSheet WEB UI  -  http://localhost:3000
echo  Live logs below. Leave this window OPEN. Close it to stop.
echo ============================================================
echo.
"C:\Users\derek\scoop\apps\nodejs-lts-np\24.16.0\node.exe" "C:\Users\derek\scoop\apps\nodejs-lts-np\24.16.0\node_modules\npm\bin\npm-cli.js" run dev -- -H 0.0.0.0
echo.
echo ==== WEBUI EXITED (errorlevel %errorlevel%) - read the error above ====
pause
