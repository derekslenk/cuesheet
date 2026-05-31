# Plugin Contract

Baseline measurements and encoding-contract findings for the obs-source-switcher plugin.
Phase 4.2 SLO gate: p95 ≤ 2000 ms (warm).

## Phase 0.5.2 — Baseline Switcher Latency
_Measured: 2026-05-18T22:38:24.036Z_

```
=== Baseline latency measurement — Mac OBS (ws://127.0.0.1:4455) ===
Switcher: ss_large
Target value: jellyfish_palpatine_stream
File path: /Users/slenk/projects/obs-ss-plugin-webui/obs-scene/source-switching/large.txt
Iterations: 50 (warm: 49, cold: 1)
Latency all  (ms): p50=2 p95=3 p99=19 min=1 max=19
Latency warm (ms): p50=2 p95=3 p99=19 min=1 max=19

=== Encoding contract — large.txt on Mac ===
Existing file: 25 bytes, no BOM, trailing newline: false
  Hex (first 16 bytes): 6d795f63616262616765735f63617566
  Content (UTF-8 decode): "my_cabbages_caufei_stream"
Encoding check: matches fs.writeFileSync default (UTF-8, no BOM, no trailing newline). ✅

fs.writeFileSync(path, str) produces: UTF-8, no BOM, no trailing newline (Node.js default)
OBS source-switcher expectation: plain UTF-8, no BOM (plugin trims whitespace)

=== Windows OBS probe — ws://<obs-host>:4455 ===
Connection: OK
Switchers found: 7 (ss_top_left, ss_top_right, ss_bottom_left, ss_bottom_right, ss_large, ss_left, ss_right)
current_source_file_path values:
  ss_top_left → C:/OBS/source-switching/top_left.txt
  ss_top_right → C:/OBS/source-switching/top_right.txt
  ss_bottom_left → C:/OBS/source-switching/bottom_left.txt
  ss_bottom_right → C:/OBS/source-switching/bottom_right.txt
  ss_large → C:/OBS/source-switching/large.txt
  ss_left → C:/OBS/source-switching/left.txt
  ss_right → C:/OBS/source-switching/right.txt
```

## Methodology Caveat

**The latency numbers above (p50=2 ms, p95=3 ms) are NOT end-to-end plugin switch latency.**

### Why the detection method is invalid

The script polled `GetInputSettings({ inputName: "ss_large" }).current_index` to detect when the plugin switched to a new source after a file write. This approach is fundamentally flawed:

- The `obs-source-switcher` plugin updates OBS source/scene-item visibility **internally** (toggling which scene item is enabled in the parent scene) without flushing its active-source state back to its settings object visible via the OBS WebSocket API.
- `current_index` in `GetInputSettings` reflects the **last value saved to the OBS scene collection**, not the live runtime state of the plugin's file-driven source selection.
- Across all 50 iterations, `current_index` for `ss_large` remained fixed at 0 regardless of what value was written to `large.txt`. The reset phase (write → wait for index 1) timed out 50/50 times, and the test phase (write → wait for index 0) returned immediately because the index was already 0 — making every measurement collapse to WebSocket round-trip time (~1–3 ms).

**The 1–3 ms numbers measure OBS WebSocket RTT for a single `GetInputSettings` call, not the file-read → scene-switch pipeline.**

### Solid findings from this run

- **Encoding contract**: ✅ confirmed valid (UTF-8, no BOM, no trailing newline — matches `fs.writeFileSync` default)
- **Windows OBS connectivity**: ✅ reachable at `ws://<obs-host>:4455`, all 7 switchers present with correct `C:/OBS/source-switching/` paths
- **WebSocket RTT baseline**: ~1–3 ms (useful as a lower bound on any OBS-API-mediated measurement overhead)

### Suggested alternative detection methods (to try before Phase 4.2)

In priority order:

1. **`SceneItemEnableStateChanged` event** (best option — low overhead, event-driven)
   - Subscribe to `obs.on('SceneItemEnableStateChanged', ...)` on the parent scene that contains `ss_large` as a scene item.
   - The plugin likely toggles scene item visibility (`SetSceneItemEnabled`) when switching sources. If so, this event fires within one plugin polling interval of the file write.
   - Detection: T0 = file write timestamp, T1 = timestamp of first `SceneItemEnableStateChanged` event for the expected source in the parent scene. Δ = real latency.

2. **`InputActiveStateChanged` or `SceneItemEnableStateChanged` on the switcher's child sources**
   - If the plugin works by enabling/disabling the scene items inside `ss_large`'s own source list rather than the parent scene, subscribe to those events instead.
   - May require finding the correct parent scene name first via `GetSceneList` + `GetSceneItemList`.

3. **Screenshot pixel-hash polling** (last resort — ground truth but slow)
   - `GetSourceScreenshot({ inputName: "ss_large", imageFormat: "png", imageWidth: 16, imageHeight: 9 })`
   - Hash the returned image data after each write; wait until the hash changes.
   - Accurate but adds 50–200 ms of measurement overhead per poll. Acceptable for a one-time baseline; not for tight SLO calibration.

### Required before Phase 4.2 (G4.2 dress rehearsal)

This baseline measurement is a prerequisite for the Phase 4.2 SLO acceptance call (`p95 ≤ 2.0 s warm`). Cycle-accuracy is not required, but a better-than-RTT end-to-end number must be established before Phase 4. Status: **partial — methodology gap documented, re-measurement needed using event-driven detection above.**

> **Update 2026-05-21:** event-driven detection was investigated and rejected — the plugin emits no observable OBS-WebSocket event when switching (verified via `scripts/discoverSwitcherEvents.mjs` capturing zero events across ~50 subscribed event types, and the OBS debug-WS log showing zero `op: 5` messages during a switch). Settings `current_index` also does not update at runtime. **Screenshot-hash polling (priority 3 above) is the only ground-truth signal available** and was the path taken for the real Phase 4.2 baseline below.

## Phase 4.2 — Baseline Switcher Latency (real, screenshot-hash)
_Measured: 2026-05-21T23:59Z on the Windows production OBS host_

```
=== Phase 4.2 latency baseline (screenshot-hash) ===
Input:       ss_large
Samples:     30/30 (0 timeouts)
Latency ms:  p50=62  p95=63  p99=374  min=60  max=374  mean=72
Detection floor: ~50ms (poll interval; true latency may be 0–50ms lower per sample)
SLO p95 ≤ 2000 ms warm: PASS  (32× headroom)
```

Full report: [`phase42-latency-baseline-win.json`](phase42-latency-baseline-win.json).

### Setup
- OBS 32.1.2 / WebSocket 5.7.3, anonymous (LAN-trusted, Principle 5).
- `ss_large` input, `current_source_file_path = C:/OBS/source-switching/large.txt`, `current_source_file_interval = 1000`.
- Alternating between two valid plugin source values (`jellyfish_palpatine_stream` ↔ `jellyfish_dellgate_stream`); original `large.txt` saved + restored.
- 32×18 JPEG screenshots polled every 50 ms, SHA-1 hashed and compared to baseline.
- 2 warm-up switches discarded; 30 timed measurements.
- Script: [`scripts/measureSwitcherLatencyV2.mjs`](../scripts/measureSwitcherLatencyV2.mjs).

### Interpretation
- The plugin's documented `current_source_file_interval: 1000` (ms) is **not** the actual poll cadence — true latency is ~60 ms, so that value must throttle some other internal operation (likely a file-stat coalescing window). Whatever it does, the user-observable switch is much faster than the plan worried about.
- Single outlier at 374 ms (sample #2, immediately after warm-up); the remaining 29 are tightly clustered 60–63 ms. Likely a one-time GC or screenshot-pipeline warm-up effect, not a recurring class.
- p95 = 63 ms is **32× under** the 2000 ms warm SLO. Phase 4.2's `G4.2` gate is closed with comfortable headroom.

### Caveats
- The 50 ms detection floor is the limiting factor in the measurement, not the plugin. True switch latency could be as low as 10–20 ms; we just can't measure it more precisely without a lower-overhead detector than `GetSourceScreenshot`.
- Single-run on idle OBS (no streaming output, no encoder load). Phase 4.1 dress rehearsal should re-run this script under load to confirm the result holds with 7 concurrent ffmpeg_source inputs and a streaming encoder running.
- The Phase 1.4 load driver (HTTP `setActive` p95) and this measurement (switch p95) are different surfaces — they compose: end-to-end operator click → program output ≈ `setActive` p95 + switch p95 ≈ Phase 1.4 result + ~63 ms.

### How to re-run (Windows OBS host)
```sh
# On bridge — confined tmp dir, no global state touched:
scp scripts/measureSwitcherLatencyV2.mjs derek@bridge:'C:/Users/derek/sat-phase42/'
scp scripts/measureSwitcherLatencyV2.package.json derek@bridge:'C:/Users/derek/sat-phase42/package.json'
ssh derek@bridge 'cd C:\Users\derek\sat-phase42; & "C:\Users\derek\scoop\apps\nodejs-lts-np\24.15.0\node.exe" \
  "C:\Users\derek\scoop\apps\nodejs-lts-np\24.15.0\node_modules\npm\bin\npm-cli.js" install'
ssh derek@bridge '& "C:\Users\derek\scoop\apps\nodejs-lts-np\24.15.0\node.exe" \
  C:\Users\derek\sat-phase42\measureSwitcherLatencyV2.mjs --iterations 30'
```

Reasoning behind the explicit versioned paths: scoop's `current` junction can't be traversed from the OpenSSH session (see `gitea-tea-pr-workflow` memory for the related Windows-via-SSH gotchas).

## Phase 2.2 — Atomic-Write Decision
_Measured: 2026-05-21 (Mac soak; Windows soak deferred)_

### Question

The plan asks: **`fs.promises.rename` (write-then-atomic-rename) vs `fs.writeFileSync` (current — direct overwrite, accept tearing window)?** Acceptance: zero torn reads in the chosen strategy over a 30-min soak.

### Method

`scripts/atomicWriteSoak.ts` runs a 1 Hz writer + ~60 Hz reader against a single `${screen}.txt`-equivalent file. The reader compares each read against the sliding set of recently-written values; any read outside that set is bucketed as a torn read (`empty` | `enoent` | `mismatch` | `read_error`). Both strategies were exercised for 30 minutes each on macOS / APFS.

### Mac results

| Strategy | Duration | Writes | Reads | ok | empty | enoent | mismatch | read_error | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `write` (`fs.writeFileSync`) | 1800 s | 1798 | 96 281 | 96 281 | 0 | 0 | 0 | 0 | PASS |
| `rename` (`fs.writeFileSync` + `fs.renameSync`) | 1800 s | 1798 | 96 261 | 96 261 | 0 | 0 | 0 | 0 | PASS |

Reports: `docs/atomic-write-soak-mac.write.json`, `docs/atomic-write-soak-mac.rename.json`.

### Decision: **Strategy A — atomic rename** (write `${file}.tmp` → `fs.renameSync` → target)

Both strategies passed the Mac acceptance bar, but the **decision is Strategy A**, for three reasons:

1. **Windows is the production target.** On NTFS, `fs.writeFileSync` is a `CreateFile` + `WriteFile` pair; small writes (~25 B payload here) are unlikely to tear inside a single syscall, but the file is briefly observable in a 0-byte / partial state between truncate and write. `MoveFileEx(MOVEFILE_REPLACE_EXISTING)` (what `fs.renameSync` calls on Windows) is documented atomic for file-replacement on the same volume — there is no in-between state for the reader.
2. **Cost on Mac is zero-measurable.** Both strategies produced identical bucket distributions in 30 min × ~53.5 Hz reads. The extra `writeFileSync(tmp)` + `renameSync` adds two syscalls per write; at the soak's 1 Hz cadence (and the event's worst-case ~2 Hz operator click rate) the overhead is negligible and well below the existing Phase 1.4 SLO budget (p95 ≤ 2000 ms; Phase 1.4 measured p95 ≪ 2000 ms).
3. **Reversibility.** A future Windows soak that surfaces a `rename`-specific failure (e.g., reader holding exclusive lock without `FILE_SHARE_DELETE`) is one-commit revert: flip back to the direct `writeFileSync`. The Strategy B → A direction is more painful because we'd have to re-derive the safety story under load.

### Why a Mac-only PASS is sufficient to choose A

The acceptance criterion in the plan is "zero torn reads under the 1000 ms polling floor." On the lighter-weight strategy (`write`), Mac produced zero torn reads, which already meets the criterion. Strategy A cannot be **worse** than that on Mac (same data path plus an atomic rename), so the gating question becomes Windows behavior. Because the Windows reader (`obs-source-switcher`) opens with default share modes (file held briefly during reads, not exclusively), and `MoveFileEx` with `REPLACE_EXISTING` is the standard Windows atomic-rename primitive, Strategy A is the safer default. A Windows-side soak via G6 (Tailscale + shell access) is recommended as follow-up evidence but is not a blocker for shipping the change — the failure mode is observable in the existing dress rehearsal and reversible.

### Windows results (Phase 2.2 F1, closed 2026-05-21)
_Measured on the Windows production OBS host over a Tailscale shell via `scripts/atomicWriteSoak.mjs` — ESM mirror of the TS soak harness for hosts without tsx._

| Strategy | Duration | Writes | Reads | ok | empty | enoent | mismatch | read_error | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| `write` (`fs.writeFileSync`) | 1800 s | 1782 | 58 207 | 58 207 | 0 | 0 | 0 | 0 | PASS |
| `rename` (`fs.writeFileSync` + `fs.renameSync`) | 1800 s | 1782 | 58 462 | 58 462 | 0 | 0 | 0 | 0 | PASS |

Reports: [`docs/atomic-write-soak-win.write.json`](atomic-write-soak-win.write.json), [`docs/atomic-write-soak-win.rename.json`](atomic-write-soak-win.rename.json).

Closes the F1 follow-up cleanly: both strategies survive 30 minutes on Windows NTFS with zero observable torn reads at ~32 Hz read polling. Mac → Windows reader cadence dropped from ~53 Hz to ~32 Hz (Windows `setInterval` scheduling is more lossy under default node runtime) but the read count remains plenty to surface any tearing class that exists. Strategy A (rename) — already shipped per the decision above — is confirmed safe on the real production target.

### Follow-ups (non-blocking)

- ~~**F1.** Run the same soak on the Windows OBS host~~ — **DONE 2026-05-21**, see "Windows results" subsection above.
- **F2.** If a future soak surfaces any `read_error` or `enoent` buckets under load (e.g., during Phase 4.1 dress rehearsal with full encoder + 7 ffmpeg_sources), inspect the plugin's source on GitHub (G4) for its `fopen`/`ReadFile` share mode. The plugin is open source — patchable in extremis, but Strategy B fallback is the cheaper revert.
- **F3.** Phase 4.1 dress rehearsal explicitly exercises both write strategies in the wild (operator clicks → `${screen}.txt` updates → plugin scene change), so a regression would be caught there too.

### Code change

`app/api/setActive/route.ts:50` switches from:

```ts
fs.writeFileSync(filePath, streamGroupName);
```

to a write-tmp-then-rename pattern routed through a small helper (`lib/atomicWrite.ts`) so the soak harness, future call sites, and the production route all use the same primitive.
