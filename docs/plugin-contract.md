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

=== Windows OBS probe — ws://192.168.13.21:4455 ===
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
- **Windows OBS connectivity**: ✅ reachable at `ws://192.168.13.21:4455`, all 7 switchers present with correct `C:/OBS/source-switching/` paths
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
