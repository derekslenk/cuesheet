# CueSheet Windows ops tooling (superseded)

> **Replaced by the cross-platform `cuesheet` binary.** The launch/monitor
> scripts that used to live in the repo root — `run-dev.cmd`, `run-sup.cmd`,
> `watch.cmd`/`watch.ps1`, `status.cmd`/`status.ps1`, `gui.cmd`/`gui.ps1`,
> `monitor.cmd`, `mon-start.ps1`, `mon-stop.ps1` — have been **removed**. Use the
> `cuesheet` binary instead; it does the same jobs on Windows, macOS, and Linux.
> See the "Unified `cuesheet` binary" section of the root
> [`README.md`](../README.md).

| Old (removed)                  | New (`cuesheet` binary)                 |
| ------------------------------ | --------------------------------------- |
| `run-dev.cmd`                  | `cuesheet dev`                          |
| `run-sup.cmd`                  | `cuesheet sup`                          |
| `watch.cmd` / `watch.ps1`      | `cuesheet watch`                        |
| `status.cmd` / `status.ps1`    | `cuesheet status`                       |
| `mon-start.ps1`                | `cuesheet start --which both\|sup\|web` |
| `mon-stop.ps1`                 | `cuesheet stop`                         |
| `gui.cmd` / `gui.ps1`          | `cuesheet gui`                          |
| `monitor.cmd` (.NET WPF)       | `cuesheet gui` (cross-platform TUI)     |

## `monitor/` — .NET WPF GUI (deprecated)

The native WPF (.NET 9) control panel under `monitor/` is **deprecated** in favor
of the cross-platform `cuesheet gui` TUI and will be removed in a follow-up. It is
kept temporarily for reference only.

> **⚠️ Its Start/Stop buttons no longer work** — they shelled out to the deleted
> `mon-start.ps1` / `mon-stop.ps1` helpers. Use `cuesheet start` / `cuesheet stop`
> (or the `cuesheet gui` TUI) instead.

If you still need to build it: `dotnet build -c Release`, then run
`monitor\bin\Release\net9.0-windows\CueSheetMonitor.exe`. It polls the supervisor
`:8080/health` and the webui `:3000` every 2s.

## How services are launched now

- **Interactive / dev:** the `cuesheet` binary — `cuesheet start`, `cuesheet sup`,
  `cuesheet dev`, `cuesheet gui`. Run `cuesheet doctor` to verify streamlink/ffmpeg
  paths, ports, and directories before an event.
- **Event host (production):** the Streamlink supervisor typically runs as an NSSM
  Windows service (`StreamlinkSupervisor`) — see
  [`docs/RUNBOOK_EVENT.md`](../docs/RUNBOOK_EVENT.md). That service path is
  unchanged; the `cuesheet` binary is the operator/dev convenience layer.

NOTE: paths to node/streamlink/ffmpeg are still resolved per host. The binary
resolves them via precedence (flag → env → `.env.local` → per-OS default, with
PATH lookup on macOS/Linux); `cuesheet doctor` prints each resolved value and its
source.
