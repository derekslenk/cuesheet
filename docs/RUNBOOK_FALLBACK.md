# Stream-a-Thon 2026-06-13 — Fallback Operations Runbook

**Use this when:** webui is down, plugin is misbehaving, OBS host unreachable, or you need
to switch scenes without automation. Two operators minimum. Driver acts; observer confirms.

---

## Table of Contents

1. [Trigger criteria](#1-trigger-criteria)
2. [Pre-event operator setup (do once)](#2-pre-event-operator-setup-do-once)
3. [Hotkey reference](#3-hotkey-reference)
4. [Procedure: File-write fallback (plugin alive, webui dead)](#4-procedure-file-write-fallback-plugin-alive-webui-dead)
5. [Procedure: Plugin-free operator mode — S8](#5-procedure-plugin-free-operator-mode--s8)
6. [Procedure: BRB / Starting Soon scene](#6-procedure-brb--starting-soon-scene)
7. [Procedure: RAM saturation — S1](#7-procedure-ram-saturation--s1)
8. [Procedure: Restore corrupted scene — S3](#8-procedure-restore-corrupted-scene--s3)
9. [Procedure: OBS host inaccessible — S7](#9-procedure-obs-host-inaccessible--s7)
10. [Rollback: Revert webui to last known-good](#10-rollback-revert-webui-to-last-known-good)
11. [Pre-event dry-run checklist](#11-pre-event-dry-run-checklist)

---

## 1. Trigger criteria

| Symptom | Scenario | Jump to |
|---|---|---|
| Webui returns errors / unresponsive | Generic | §4 |
| Plugin ignores file writes; OBS input frozen | S8 | §5 |
| Need BRB or Starting Soon immediately | Any | §6 |
| `obs64.exe` >12 GB RAM; dropped frames | S1 | §7 |
| OBS refuses to open scene collection | S3 | §8 |
| Cannot reach Windows host at all | S7 | §9 |

---

## 2. Pre-event operator setup (do once)

- [ ] Two operators present: **Driver** (keyboard) + **Observer** (monitors output)
- [ ] Open this runbook on second monitor (not in OBS window)
- [ ] Confirm `C:\OBS\source-switching\` is accessible in Windows Explorer — you should see 7 `.txt` files: `large.txt`, `left.txt`, `right.txt`, `top_left.txt`, `top_right.txt`, `bottom_left.txt`, `bottom_right.txt`
- [ ] Confirm OBS is open and the SaT scene collection is loaded (scenes: `1-Screen`, `2-Screen`, `4-Screen`, `BRB`, `Starting`)
- [ ] Confirm hotkeys in §3 work — test each one before doors open
- [ ] Confirm Notepad (or VS Code) is ready for file-write procedure (§4)

---

## 3. Hotkey reference

> **TODO(operator):** Fill in actual OBS hotkey bindings before event day. Assign these in OBS → Settings → Hotkeys.

| Action | Hotkey | OBS Scene/Target |
|---|---|---|
| Switch to BRB scene | `TODO(operator)` | `BRB` |
| Switch to Starting Soon scene | `TODO(operator)` | `Starting` |
| Switch to 4-Screen layout | `TODO(operator)` | `4-Screen` |
| Switch to 2-Screen layout | `TODO(operator)` | `2-Screen` |
| Switch to 1-Screen layout | `TODO(operator)` | `1-Screen` |
| Global audio mute | `TODO(operator)` | — |

---

## 4. Procedure: File-write fallback (plugin alive, webui dead)

Use when: webui is dead but OBS source-switcher plugin is still responding to file changes.
Polling interval is **1000 ms** — switch takes effect within 1 second of save.

**Screen → file mapping:**

| Screen | File path |
|---|---|
| Large | `C:\OBS\source-switching\large.txt` |
| Left | `C:\OBS\source-switching\left.txt` |
| Right | `C:\OBS\source-switching\right.txt` |
| Top-left | `C:\OBS\source-switching\top_left.txt` |
| Top-right | `C:\OBS\source-switching\top_right.txt` |
| Bottom-left | `C:\OBS\source-switching\bottom_left.txt` |
| Bottom-right | `C:\OBS\source-switching\bottom_right.txt` |

**Steps:**

1. Open Windows Notepad (or any plain-text editor — NOT Word)
2. `File → Open` → navigate to `C:\OBS\source-switching\`
3. Open the file for the screen you want to change (e.g., `large.txt`)
4. Replace the entire contents with the stream group name exactly as configured in the webui (e.g., `jellyfish_palpatine_stream`)
5. `File → Save` (Ctrl+S) — encoding must be UTF-8, no BOM
6. **Observer:** confirm the corresponding OBS source switcher input (`ss_<screen>`) switches within 2 seconds
7. If nothing changes after 5 seconds → plugin is not responding → go to **§5**

> **Note:** File contents must exactly match a `value` in the OBS source-switcher input's `sources` array. If the name doesn't match, the input silently stays on the current source. Use `scripts/verifySwitcherCoverage.ts` pre-event to confirm coverage.

---

## 5. Procedure: Plugin-free operator mode — S8

Use when: `obs-source-switcher` plugin is not responding to file changes at all.
**Leading indicators:** file changes have no effect after 5+ seconds; OBS log shows plugin load error or pinned input.

1. Stop writing to `C:\OBS\source-switching\` — file writes are now inert
2. In OBS, open the **Sources** panel
3. Locate the source-switcher input for the affected screen (named `ss_large`, `ss_left`, etc.)
4. **TODO(operator):** Determine the correct OBS UI action to manually select a source within the source-switcher input. Options depending on plugin version:
   - Right-click the input → look for "Select source" or similar
   - Or: double-click to open plugin settings and select a source from the dropdown
5. Select the desired stream source by name (same name that would go in the `.txt` file)
6. Click OK / Apply
7. **Observer:** confirm program output switches
8. Repeat per screen as needed — one screen at a time
9. Notify ops lead that plugin is in manual mode; log time and affected screens

> **Backup-only emergency:** The `obs-source-switcher` plugin is open-source (GitHub). In an absolute last resort, a hot-fix on the prod box is theoretically possible but should NOT be attempted during the event. Escalate to project owner.

---

## 6. Procedure: BRB / Starting Soon scene

Use when: you need to hide stream content immediately regardless of webui/plugin state.

1. Press BRB hotkey (`TODO(operator)`) → OBS switches to `BRB` scene — **takes effect in <1 second**
2. If hotkey fails: OBS → Scenes panel → double-click `BRB`
3. For Starting Soon: hotkey (`TODO(operator)`) or double-click `Starting` scene
4. Audio: `TODO(operator)` — document whether BRB scene has music auto-play, and how to mute/unmute

> BRB is your safe state. When in doubt, hit BRB first, then diagnose.

---

## 7. Procedure: RAM saturation — S1

**Trigger:** `obs64.exe` working set >12 GB (check Task Manager), Windows commit charge >85%, or dropped frames visible in OBS stats.

1. Hit BRB hotkey immediately (§6) — stop showing degraded output
2. Switch OBS to `4-Screen` layout (hotkey or Scenes panel)
3. Identify which Streamlink processes are serving idle/off-screen streams:
   - Open Task Manager → Details tab → sort by CPU/RAM → look for `streamlink.exe` instances
   - `TODO(operator)`: document process naming convention for idle vs. active streams
4. Kill idle Streamlink processes: right-click → End Task (or use PowerShell: `Stop-Process -Name streamlink`)
5. Wait 10–15 seconds; watch `obs64.exe` working set in Task Manager
6. If RAM drops below 8 GB → exit BRB → resume with 4-Screen layout
7. If RAM does not drop: kill 2 more Streamlink processes; repeat
8. Log: time, OBS RAM at trigger, how many Streamlinks killed, recovery time

> **4-Screen cap:** Run with 4 active streams maximum for the rest of the event if RAM saturation recurs.

---

## 8. Procedure: Restore corrupted scene — S3

**Trigger:** OBS refuses to open scene collection after a `convertBrowserToMedia` migration, or scene JSON is invalid.

1. Close OBS completely
2. Open Windows Explorer → navigate to `%APPDATA%\obs-studio\basic\scenes\`
3. Locate the most recent backup directory: `scenes.backup.{ISO}/` (e.g., `scenes.backup.2026-06-12T1430/`)
   - **TODO(operator):** confirm backup directory naming convention and location used by `convertBrowserToMedia` script
4. Copy backup files over current scenes:
   ```
   xcopy "%APPDATA%\obs-studio\basic\scenes\scenes.backup.{ISO}\" ^
         "%APPDATA%\obs-studio\basic\scenes\" /Y /E
   ```
5. Restart OBS → load SaT scene collection
6. Verify all 7 source-switcher inputs (`ss_large` … `ss_bottom_right`) are present and resolve
7. If collection still fails: revert webui to browser-source codepath:
   - On webui host: set env var `USE_FFMPEG_SOURCE=false` (or equivalent flag — **TODO(operator):** confirm flag name)
   - Restart Next.js server: `pm2 restart webui` (or `TODO(operator)`: document actual restart command)
8. Notify migration owner; do not re-run `convertBrowserToMedia` until root cause is identified

---

## 9. Procedure: OBS host inaccessible — S7

**Trigger:** Cannot reach Windows OBS host via SSH, RDP, or WebSocket (`<obs-host>:4455`).

1. Verify network path: `ping <obs-host>` from both LAN and Tailscale
2. If Tailscale is down: try direct LAN connection; notify network lead
3. If host is unreachable entirely:
   - **Freeze event scope** — do not attempt Phase 1+ migrations
   - Announce "degraded mode" to ops team
   - Continue streaming from whatever state OBS is currently in (do not restart OBS remotely without confirmed access)
4. If host becomes reachable again:
   - Reconnect OBS WebSocket: `ws://<obs-host>:4455` (LAN-trusted)
   - Verify scene collection is still loaded and plugin is running
   - Resume normal operations; no config changes until stability confirmed for 5+ minutes
5. If host remains inaccessible through event start: cancel Phase 1+ scope; ship Phase 0.5.4 runbook-only

---

## 10. Rollback: Revert webui to last known-good

```bash
# On webui host:
git log --oneline -10          # identify last known-good SHA
git checkout <sha>             # or: git revert <bad-sha>
# TODO(operator): document actual webui restart command
pm2 restart webui              # or: npm run start, or systemctl restart webui
```

Verify: open webui in browser → confirm streams load → test one `setActive` call.

---

## 11. Pre-event dry-run checklist

Run this end-to-end with both operators **before doors open**. Both must sign off.

- [ ] Both operators have read this runbook end-to-end
- [ ] §3 hotkeys tested — all work; bindings documented in the table above
- [ ] §4 file-write tested on at least 2 screens — observer confirmed OBS switched within 2s
- [ ] §5 plugin-free mode drilled — operator manually selected a source in OBS UI
- [ ] §6 BRB hotkey tested — fires in <1 second
- [ ] §7 4-Screen layout tested — switch confirmed in OBS
- [ ] §8 backup directory located and verified accessible (do not restore — just confirm it exists)
- [ ] §9 `ping <obs-host>` confirmed from this seat
- [ ] `scripts/verifySwitcherCoverage.ts` run — zero coverage gaps reported
- [ ] **Driver sign-off:** `TODO(operator)` _________________________ Date: ___________
- [ ] **Observer sign-off:** `TODO(operator)` _______________________ Date: ___________
