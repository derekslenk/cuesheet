# Supervisor Self-Guard (single-instance via procState takeover) — Design Spec

**Status:** approved (3-model PAL consensus + Windows-native constraint folded in)
**Branch:** `feat/supervisor-port-guard`

## Goal
Make supervisor startup idempotent: exactly one supervisor on the health port. If a previously-launched supervisor is still running, the new one **reclaims** it (kills it, then binds). The supervisor also self-registers so it can be reaped — by the next startup OR by `cuesheet stop`.

## Why this design (consensus outcome)
A 3-model PAL panel split on the original "probe `/health`, derive PID from the port, kill it" design:
- **gemini-2.5-pro (against, 9/10):** kill-by-port-derived-PID is a classic TOCTOU/PID-reuse anti-pattern; `lsof`/`netstat` parsing is brittle; it masks the real lifecycle bug. Prefer a lock/PID-file singleton or fail-fast.
- **gpt-5.2 (for) / gpt-5.1-codex (neutral):** acceptable *only* with a recorded-PID + verified-identity kill (not port-derived), and a PID/lock-file as the primary mechanism.

All three converge on: **recorded PID + verified identity, not port→PID.** The repo already has exactly that primitive — `src/cli/lib/procState.ts` (`run-state.json` + lock; `isLive`; `isSafeToKill` = live-image match, the PID-reuse guard; `killRecord` = Windows `taskkill /PID <pid> /T /F`, reaps streamlink/ffmpeg children). `cuesheet stop` already uses it. We reuse it. This also fixes the **root cause** (ad-hoc `npm run supervisor` launches become tracked → `cuesheet stop` reaps them too).

**Windows-native:** the operator avoids WSL2 and ships Windows-native (`bun-windows-x64` binary + tsx). procState's win32 paths (`taskkill /T /F`, `tasklist`) are exactly what we exercised by hand this session. No POSIX-specific code is added.

## Design

### Module: `scripts/streamlink-supervisor/supervisorGuard.ts`
`ensureSoleSupervisor(opts): Promise<{ action }>` — called at the top of `startRuntime`, before `startHealthServer`. Uses `procState` (`get`/`isLive`/`isSafeToKill`/`killRecord`/`add`/`remove`/`makeFingerprint`) + a `waitPortFree` helper.

Logic (env `SUPERVISOR_PORT_GUARD=off` short-circuits to `{action:'disabled'}`):
1. `existing = procState.get('sup', env)`.
2. If `existing` and `existing.pid !== process.pid`:
   - **live + isSafeToKill** → `killRecord(existing)`; `remove('sup')`; `waitPortFree(healthPort)` (poll ≤ ~3s); if still busy → throw `SupervisorPortBusyError`. → `action:'tookover'`.
   - **live + NOT isSafeToKill** (reused PID, or a different-runtime/foreign process we can't verify) → **refuse**: throw `SupervisorTakeoverRefusedError` (don't touch records, don't kill a stranger). The operator gets a clear message.
   - **dead/stale record** → `remove('sup')`. → continue.
3. **Self-register** unless already tracked as this PID (so `cuesheet start`, which records us with a logPath, isn't clobbered — pid-match guard): `procState.add({ role:'sup', pid: process.pid, startTime, cmdFingerprint: makeFingerprint(process.argv, cwd), ports:[healthPort, basePort], logPath: opts.logPath ?? '' })`. → `action:'registered'` (or `'skipped'` if already us).

### Wiring (`runtime.ts`)
- Call `ensureSoleSupervisor` at the very start of `startRuntime` (before binding). Covers all three entrypoints (tsx `index.ts`, `index.bun.ts`, `cuesheet sup`) — no per-entrypoint drift.
- On clean shutdown (`runtime.shutdown()`), `procState.remove('sup', env)` **iff** the current `sup` record's pid === `process.pid` (don't delete a successor's record).

### Why this is safe (vs the rejected design)
- **No port→PID derivation:** we kill a PID we *recorded*, not one we scraped from `netstat` at kill time. The TOCTOU window gemini flagged is gone.
- **PID-reuse guard:** `isSafeToKill` confirms the live PID's image still matches before killing; on any mismatch we **refuse** (never kill a stranger). Refusing degrades to a clear fail-fast, the safe default both gemini and codex wanted.
- **No new brittle parsing** in the authorization path; reuses code already trusted by `cuesheet stop`.
- **cuesheet start unchanged:** its port pre-check already guarantees `:8080` is free before it spawns, so the takeover branch never fires on that path; the pid-match guard preserves its richer record.

### Cross-runtime caveat (accepted)
If a *binary* supervisor starts while a *tsx* supervisor is stale (or vice-versa), `isSafeToKill` sees mismatched images → **refuse** + clear error → operator stops the other manually. Rare (dev is consistently tsx; prod consistently the binary); safe by construction.

## Test plan (TDD, Jest, node env)
`__tests__/supervisorGuard.test.ts` (jest.mock `procState`):
- no existing record → `add` called → `{action:'registered'}`.
- existing, different pid, live + safe → `killRecord` + `remove` + `add`, `waitPortFree` resolves → `{action:'tookover'}`.
- existing, different pid, live + NOT safe → throws `SupervisorTakeoverRefusedError`; `killRecord` NOT called.
- existing, different pid, dead → `remove` + `add`, no `killRecord` → `{action:'registered'}`.
- existing pid === process.pid → no kill, no re-add → `{action:'skipped'}`.
- `SUPERVISOR_PORT_GUARD=off` → `{action:'disabled'}`, no procState calls.
- takeover but port never frees → throws `SupervisorPortBusyError`.
- `waitPortFree` unit: resolves true when an ephemeral port is closed; false on timeout while held.
- `runtime.ts`: shutdown removes the `sup` record only when its pid === process.pid (mock procState).

Real `killRecord`/`isSafeToKill` (which shell out) are mocked in units; exercised by the binary smoke + manual restart.

## Out of scope
- Zero-overlap restart (separate follow-up).
- `/health` identity header (not needed — detection is via the procState record, not a port probe; could be added later as a secondary confirmation).
