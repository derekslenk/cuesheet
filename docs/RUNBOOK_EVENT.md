# Stream-a-Thon 2026-06-13 — Event Operations Runbook

This is the **primary** event-day playbook. Operators read this from start
to finish. Detailed emergency procedures live in
[`docs/RUNBOOK_FALLBACK.md`](RUNBOOK_FALLBACK.md); this file points there
for the deep steps.

**Two operators minimum.**
**Driver** runs the webui keyboard and OBS hotkeys.
**Observer** watches the program output, the supervisor dashboard, and the
obs-metrics log, calling out anything concerning.

---

## Table of Contents

1. [Roles and stations](#1-roles-and-stations)
2. [Pre-event setup (T-60 min)](#2-pre-event-setup-t-60-min)
3. [Event-day timeline](#3-event-day-timeline)
4. [Normal-operation cadence](#4-normal-operation-cadence)
5. [Scenario quick-reference (S1–S8)](#5-scenario-quick-reference-s1s8)
6. [S8 plugin-free operator mode — drill](#6-s8-plugin-free-operator-mode--drill)
7. [Rollback recipe (Phase 3.4)](#7-rollback-recipe-phase-34)
8. [Post-event teardown](#8-post-event-teardown)
9. [Two-operator sign-off](#9-two-operator-sign-off)

---

## 1. Roles and stations

| Role | Responsibilities | Station |
|---|---|---|
| **Driver** | Webui actions (`setActive`, scene transitions), OBS hotkeys, file-write fallback if needed | Primary keyboard + monitor 1 (webui) + monitor 2 (OBS preview/program) |
| **Observer** | Program output check, supervisor `/health` dashboard, Task Manager (`obs64.exe` working set), obs-metrics log tail | Secondary monitor (dashboard) + Task Manager + (optional) phone with `RUNBOOK_FALLBACK.md` open for reference |
| **(Optional) Floor** | Coordinates with on-camera talent / teams, relays scene-change requests to Driver | Headset / off-mic comms |

Driver does not also observe. Observer does not also drive.

---

## 2. Pre-event setup (T-60 min)

Run this checklist **before doors open**. Both operators sign §9 at the end.

### Webui

- [ ] Webui reachable in browser; streams list loads with all event teams present
- [ ] Run `npm run verify:switcher-coverage` — zero coverage gaps reported
- [ ] (If feasible on event-day environment) Run `npm run load:setactive` against a non-program copy of OBS to confirm p95 ≤ 2 s warm — see `docs/plugin-contract.md` for the SLO definition

### OBS host

- [ ] `obs64.exe` is running; SaT scene collection is loaded
- [ ] `4-Screen` is the active scene; all 7 source-switcher inputs (`ss_large`, `ss_left`, `ss_right`, `ss_top_left`, `ss_top_right`, `ss_bottom_left`, `ss_bottom_right`) resolve to a valid source
- [ ] `C:\OBS\source-switching\` contains the 7 `.txt` files (`large.txt`, `left.txt`, `right.txt`, `top_left.txt`, `top_right.txt`, `bottom_left.txt`, `bottom_right.txt`) and `sources.db`
- [ ] Hotkeys from `RUNBOOK_FALLBACK.md` §3 tested — each fires in <1 s

### Streamlink supervisor

- [ ] Service is running: `Get-Service StreamlinkSupervisor` shows `Running` (NSSM)
- [ ] Dashboard reachable: `http://127.0.0.1:8080/` shows overall status `ok` and one row per supervised stream with `running` status, restart count 0
- [ ] Tail the supervisor stdout (`C:\OBS\logs\supervisor-stdout.log`) — no recent ERROR lines

### OBS metrics scraper

- [ ] Scheduled task is running: `Get-ScheduledTask ObsMetricsScraper | Get-ScheduledTaskInfo` shows `LastTaskResult: 267009` (running) or recent successful exit
- [ ] Latest hourly log has fresh entries:
  ```powershell
  Get-Content -Tail 5 (Get-ChildItem 'C:\OBS\logs\obs-metrics\obs-metrics-*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  ```
- [ ] `obs64.exe` working set in the latest sample is **< 4 GiB** (baseline; alert threshold is 12 GiB per pre-mortem S1)

### Backup snapshot

- [ ] Scene-collection backup exists at `%APPDATA%\obs-studio\basic\scenes\scenes.backup.{ISO}\` (from `convertBrowserToMedia` Phase 1.3 + `capturePhase05Snapshot.sh` Phase 0.5.3)
- [ ] `sources.db` backup copy exists outside of `C:\OBS\source-switching\` (per Phase 0.5.3) — last modified within the previous 7 days
- [ ] Note the exact backup path on a sticky note attached to the Driver monitor

### Communication

- [ ] Both operators have read this runbook end-to-end
- [ ] Both operators have read `RUNBOOK_FALLBACK.md` end-to-end
- [ ] Phone numbers of project owner + ops lead written on a sticky note at the Driver station

---

## 3. Event-day timeline

All times are local. Adjust by event schedule.

| Time | Action | Owner |
|---|---|---|
| **T-60** | Run §2 pre-event setup checklist | Both |
| **T-45** | Driver pre-warms a candidate stream pool (open the streams the event is most likely to use; let Streamlink reach steady state) | Driver |
| **T-30** | Switch OBS to `Starting` scene (or BRB). Test stream audio levels at low volume. | Driver |
| **T-15** | Final hotkey test (BRB / Starting / 4-Screen / 2-Screen / 1-Screen). Observer confirms each switch. | Both |
| **T-5** | Switch to event open scene. Verify program output one more time. | Driver, Observer confirms |
| **T-0** | **Doors open / event starts.** Normal-operation cadence begins (§4). | Both |
| **Mid-event breaks** | At each scheduled break: BRB hotkey → confirm → bring back at end of break. Document any scene/source name changes during breaks (operator-led). | Driver |
| **T+end** | Switch to `BRB` then `Starting` (or end card scene). Wait for final confirmation from event lead before stopping anything. | Driver |
| **T+30** | Run §8 post-event teardown. | Both |

---

## 4. Normal-operation cadence

Once the event is live, settle into this rhythm. Set a phone timer for every 5 minutes.

### Every 5 minutes — Observer

- Check supervisor dashboard `http://127.0.0.1:8080/` — overall pill should be **`ok`**. If **`degraded`** or **`unreachable`**, call it out to Driver and consult §5.
- Glance at Task Manager → `obs64.exe` working set. If **> 8 GiB**, call it out (we're approaching the S1 threshold). If **> 12 GiB**, treat as S1 immediately (§5).
- Glance at OBS Stats window (View → Stats) for dropped frames; >1 % cumulative is a yellow flag.

### Every 30 minutes — Observer

- Tail the obs-metrics log:
  ```powershell
  Get-Content -Tail 20 (Get-ChildItem 'C:\OBS\logs\obs-metrics\obs-metrics-*.log' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
  ```
  Look for a sustained working-set climb over the last 30 min (>+1 GiB/30 min is a slow-leak signal).
- Tail the supervisor stdout log; flag any new `escalated` lines.

### During every scene transition — Driver + Observer

- Driver narrates the transition aloud ("switching large to team-alpha").
- Observer confirms on program output ("alpha is up").
- If Observer does not confirm within 2 s, Driver assumes the switch failed — go to §5.

### Restart-count thresholds — Observer

| Restart count for a single stream | Action |
|---|---|
| 0–1 | Normal — no action |
| 2 | Watch closely; consider asking talent to switch upstream away from this stream after current segment |
| 3 → `escalated` | The supervisor stops auto-restarting this stream. Treat as S2 (§5). |

---

## 5. Scenario quick-reference (S1–S8)

Use this matrix as the first lookup when something is off. The "Procedure" column links into `RUNBOOK_FALLBACK.md` for the detailed steps.

| Scenario | Leading indicator (Observer sees) | First action (Driver does) | Procedure |
|---|---|---|---|
| **S1** RAM saturation | `obs64.exe` working set > 12 GiB; dropped frames rising; obs-metrics shows climbing private-memory | **BRB hotkey immediately**, then kill idle Streamlink processes | [`RUNBOOK_FALLBACK.md` §7](RUNBOOK_FALLBACK.md#7-procedure-ram-saturation--s1) |
| **S2** Streamlink process dies | Dashboard row shows status ≠ `running`; restartCount climbing; tile black > 2 s | Wait one polling interval; if not back, switch to a different stream for that screen | Phase 2.4 `restart_on_activate=true` should auto-recover within ~2 s of next activation. If 3 restarts in 30 s the row goes `escalated`; **first action:** `POST /api/supervisor/streams/{id}/restart` or click Restart on the dashboard (recovers the escalated stream in place, no other streams affected). **Last resort only:** `nssm restart StreamlinkSupervisor` — this relaunches every stream at once (double the normal process spawn herd) and should be avoided mid-event. |
| **S3** Scene file corrupted | OBS refuses to open / load scene; pinned input | BRB; close OBS; restore from `scenes.backup.{ISO}` | [`RUNBOOK_FALLBACK.md` §8](RUNBOOK_FALLBACK.md#8-procedure-restore-corrupted-scene--s3) |
| **S4'** Name-coverage mismatch | Driver clicks `setActive`; webui returns 200; **program output does not switch** | Stop using that (stream, screen) pair; use a different stream for that screen. Post-event, run `npm run verify:switcher-coverage` and re-seed `obs-scene/SaT.json` `ss_<screen>` `sources` array | See plan iter-3.4 S4'; switcher-coverage check should have caught this pre-event |
| **S5** Streamlink cold-start | First switch to a stream that hasn't been pre-warmed takes > 5 s | Acceptable — UX is "≤ 5 s cold". If recurring, pre-warm more streams (the candidate pool from T-45) | If p95 cold > 5 s persistently, fire Phase 2.5 pre-warm (operator decision) |
| **S6** Twitch ad-break HLS reset | Tile freezes 5–30 s mid-stream; OBS log shows `Reloading playlist` | Hotkey to BRB for that screen or switch source to another stream for that segment | Ad breaks are mitigated by `TWITCH_OAUTH_TOKEN` in the supervisor's environment (must be a Twitch Turbo account token; streamlink ≥7.5 auto-filters ad segments when authenticated). If ads still appear: switch scene source to another stream or cut to the BRB card for that screen. |
| **S7** OBS host inaccessible | Dashboard `unreachable`; no WebSocket; cannot RDP | Verify network; do NOT restart OBS remotely; if host stays down, freeze scope | [`RUNBOOK_FALLBACK.md` §9](RUNBOOK_FALLBACK.md#9-procedure-obs-host-inaccessible--s7) |
| **S8** Plugin misbehaving | File writes have no effect after 5+ s; OBS log shows plugin load error | Stop using file writes; enter plugin-free operator mode (§6) | [`RUNBOOK_FALLBACK.md` §5](RUNBOOK_FALLBACK.md#5-procedure-plugin-free-operator-mode--s8) and §6 below |

When in doubt: **hit BRB first, then diagnose.**

---

## 6. S8 plugin-free operator mode — drill

This must be drilled **before doors open** by both operators. Plugin-free
mode is the universal escape hatch when `obs-source-switcher` stops
responding to file changes — operators select sources inside OBS UI
directly.

The full procedure lives in
[`RUNBOOK_FALLBACK.md` §5](RUNBOOK_FALLBACK.md#5-procedure-plugin-free-operator-mode--s8).
Summary for the dry-run:

1. **Driver**: pick any non-program screen (e.g., `bottom_right`).
2. **Driver**: write a new value to `C:\OBS\source-switching\bottom_right.txt`. **Observer**: confirm OBS switches the `ss_bottom_right` input within 2 s.
3. **Driver**: in OBS, locate the `ss_bottom_right` input under Sources; right-click → Properties (or double-click). Manually pick a different source from the plugin's source list. Click OK.
4. **Observer**: confirm program output changes to the manually-picked source.
5. **Driver**: revert to the original source via the same right-click flow.
6. **Both**: time the round-trip (file-write switch + manual switch + revert). Should be < 30 s.

If step 3 fails — i.e., the manual switch in the plugin UI doesn't update
the program output — the plugin is in a deeper bad state. Treat as S3
(scene corruption) and restore from backup.

After the drill, document the actual menu path that worked (OBS / plugin
versions change menu labels) in this file's S8 section so the next
operator sees the exact steps.

---

## 7. Rollback recipe (Phase 3.4)

Three independently-rollable surfaces. **Roll them in order**, top to
bottom, stopping at the first one that restores normal operation.

### 7.1 Webui rollback (most common)

A bad webui deploy can cause `setActive` to write wrong file contents, or
return 500s. Roll back to the previous known-good commit.

On the webui host:

```bash
# Inspect recent commits to pick a target:
cd ~/projects/obs-ss-plugin-webui
git log --oneline -10

# Two paths — pick one:

# (a) Hard switch to the last known-good SHA (loses local changes):
git checkout <known-good-sha>

# (b) Revert the bad commit but stay on main (preserves history):
git revert <bad-sha>

# Restart the Next.js process (whichever supervisor runs it):
# - If running via npm start in a tmux session:
npm run build && npm run start
# - If running under pm2:
pm2 restart webui
# - If running under systemd:
sudo systemctl restart webui
```

**Verify after rollback:**

- [ ] Webui home page loads in browser
- [ ] Streams list populates
- [ ] One `setActive` call from the UI causes OBS to switch within 2 s

### 7.2 OBS scene-collection rollback

A bad `convertBrowserToMedia` migration can corrupt the scene collection.
Restore from the timestamped backup.

On the OBS host (PowerShell, elevated):

```powershell
# Close OBS first — it must not be writing to scenes/.
Stop-Process -Name obs64 -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

# List backups; pick the most recent one before the bad migration:
Get-ChildItem "$env:APPDATA\obs-studio\basic\scenes" -Directory -Filter 'scenes.backup.*' |
  Sort-Object LastWriteTime -Descending | Select-Object Name, LastWriteTime

# Restore (replace the ISO timestamp with the chosen backup):
$src = "$env:APPDATA\obs-studio\basic\scenes\scenes.backup.2026-06-12T1430"
$dst = "$env:APPDATA\obs-studio\basic\scenes"
xcopy /Y /E "$src\*" "$dst\"

# Start OBS again; load the SaT scene collection:
Start-Process "$env:ProgramFiles\obs-studio\bin\64bit\obs64.exe"
```

**Verify after rollback:**

- [ ] OBS opens without errors
- [ ] `Scene Collection → SaT Summer 2026` loads (or whichever season's name applies)
- [ ] All 7 `ss_<screen>` inputs are present and resolve to a valid source
- [ ] One file-write switch (per `RUNBOOK_FALLBACK.md` §4) succeeds within 2 s

### 7.3 Plugin rollback

Off-scope for the event per the plan (plugin version pinned 2026-06-01 →
2026-06-14 by Q6). If the plugin appears broken, do **not** swap binaries
on event day — escalate to project owner and enter plugin-free mode (§6).

### Verification: end-to-end smoke after any rollback

Run this whole sequence after a rollback. If any step fails, the rollback
itself is broken and you need to escalate.

1. Webui home page loads.
2. Streamlink supervisor dashboard `http://127.0.0.1:8080/` shows `ok`.
3. Pick a stream; click it into a non-program screen via the webui.
4. Observer confirms the picked stream is on the chosen screen within 2 s.
5. Wait 60 s; restartCount on the chosen stream is 0.

---

## 8. Post-event teardown

Run this after the event ends. **Do not** rush — capturing artifacts now
is what makes a post-mortem possible.

- [ ] **Snapshot the OBS scene collection** to a dated backup directory:
  ```powershell
  $iso = (Get-Date -Format 'yyyy-MM-ddTHHmm')
  $src = "$env:APPDATA\obs-studio\basic\scenes"
  $dst = "$env:APPDATA\obs-studio\basic\scenes\scenes.post-event.$iso"
  New-Item -ItemType Directory -Path $dst | Out-Null
  Copy-Item -Path "$src\*.json" -Destination $dst -Recurse
  ```
- [ ] **Snapshot `sources.db`** to a dated copy on a separate disk / network share.
- [ ] **Save the supervisor logs** (`C:\OBS\logs\streamlink-supervisor\` and `supervisor-stdout.log` / `supervisor-stderr.log`) to the ops archive.
- [ ] **Save the obs-metrics logs** (`C:\OBS\logs\obs-metrics\obs-metrics-*.log`) — there are at most a few hundred KiB; keep them all.
- [ ] **Stop the Streamlink supervisor**: `nssm stop StreamlinkSupervisor` (only after logs are saved).
- [ ] **Stop the obs-metrics scheduled task** (optional — it's harmless to leave running): `Stop-ScheduledTask -TaskName ObsMetricsScraper`.
- [ ] **Note any deviations from the plan** in `docs/POST-EVENT-NOTES.md` (create it if missing) — what broke, what didn't, what we'd do differently. This feeds the R-track post-event roadmap from `.omc/plans/stream-a-thon-2026-06-13.md`.
- [ ] **Both operators initial §9 with the time of teardown completion**.

---

## 9. Two-operator sign-off

Both must initial here. Doors do not open until both have signed.

- **Driver pre-event sign-off:** _________________________  Date / time: ______________________
- **Observer pre-event sign-off:** _______________________  Date / time: ______________________
- **Driver post-event sign-off:** ________________________  Date / time: ______________________
- **Observer post-event sign-off:** ______________________  Date / time: ______________________

Notes (any deviations, recoveries, things to remember for next event):

```
[free text — fill in by hand]
```
