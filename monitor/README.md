# CueSheet Windows ops tooling

Native status monitor + start/stop helpers for the event host (Windows).

- **monitor/** - WPF (.NET 9) GUI. `dotnet build -c Release` then run
  `monitor\bin\Release\net9.0-windows\CueSheetMonitor.exe` (or double-click
  `monitor.cmd`). Polls supervisor `:8080/health` and webui `:3000` every 2s;
  Start/Stop/Dashboard/Web UI buttons.
- **mon-start.ps1 / mon-stop.ps1** - background launch/stop of the supervisor
  (tsx) and webui (next). Used by the GUI buttons; also runnable directly.
- **run-sup.cmd / run-dev.cmd** - visible-window launchers (live logs).

NOTE: paths to node/streamlink/ffmpeg are pinned to the host's scoop *versioned*
exes (the `current` junction is not spawnable). Update them if scoop upgrades.
