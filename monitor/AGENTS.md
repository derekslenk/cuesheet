<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# monitor (.NET WPF control panel — DEPRECATED)

## Purpose
A native Windows WPF (.NET 9) control panel that polls the Streamlink supervisor
`:8080/health` and the webui `:3000` every 2s. **Deprecated** in favor of the
cross-platform `cuesheet gui` TUI (`src/cli`) and slated for removal. Kept for
reference only.

> ⚠️ Its Start/Stop buttons no longer work — they shelled out to the deleted
> `mon-start.ps1` / `mon-stop.ps1` helpers. Use `cuesheet start` / `cuesheet
> stop` (or `cuesheet gui`) instead.

## Key Files
| File | Description |
| --- | --- |
| `CueSheetMonitor.csproj` | .NET 9 Windows WPF project file. |
| `App.xaml` / `App.xaml.cs` | WPF application bootstrap. |
| `MainWindow.xaml` | UI layout: health indicators + (defunct) start/stop buttons. |
| `MainWindow.xaml.cs` | Code-behind: 2s health polling of supervisor + webui; button handlers now broken. |
| `README.md` | Migration table from the removed root `.cmd`/`.ps1` launchers to the `cuesheet` binary. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `bin/`, `obj/` | `dotnet build` output (gitignored build artifacts). |

## For AI Agents
### Working In This Directory
- **Do not extend this.** New control-panel work belongs in `cuesheet gui`
  (`src/cli/commands/gui.ts` + `src/cli/lib/tui.ts`), which is cross-platform.
- If reviving for reference: `dotnet build -c Release`, run
  `monitor\bin\Release\net9.0-windows\CueSheetMonitor.exe`.
- The launch/lifecycle contract is now owned by the `cuesheet` binary; this app
  must not regain process-killing logic (the `mon-stop.ps1` blanket-kill bug is
  exactly what the binary's fingerprint-validated `stop` replaced).

### Testing Requirements
- None in-repo; not part of the Jest suite or the CI binary matrix.

## Dependencies
### External
- .NET 9 SDK, WPF (`net9.0-windows`). Reads the supervisor `/health` + webui
  HTTP endpoints only.

<!-- MANUAL: notes below preserved on regeneration -->
