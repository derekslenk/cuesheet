# Phase 2A (raw) — Security Audit

**Threat model:** Single-operator LAN. In-scope adversaries: co-network host, malicious Twitch title/URL, hostile OBS browser source. Out of scope: internet-facing. Severities calibrated to LAN.

**Executive summary:** Well-defended on the surfaces that matter. **No Critical or High findings.** Preview route allowlist-anchored against traversal; all SQL parameterized (identifier interpolation gated by whitelists); supervisor spawns streamlink/ffmpeg via argv arrays with **no shell anywhere**; overlay XSS sinks validated on write + React-escaped; SSRF via Twitch URL constrained to 30-char login vs fixed host; secrets gitignored, masked/redacted, never in client bundle / no NEXT_PUBLIC_*. Residual risk: (1) intentionally-open auth model (fail-open when API_KEY unset + spoofable Host bypass), (2) data-integrity from two-writer SQLite split (lower than A-C1 framing — both run WAL).

| ID | Sev | CWE | File | Title |
|----|-----|-----|------|-------|
| F1 | Medium | 290/348 | middleware.ts:22-25 | Spoofable Host-header auth bypass + fail-open when API_KEY unset |
| F2 | Medium | 665/662 | database.ts:117-118, bunDatabase.ts:18-20 | Two SQLite writers, divergent durability PRAGMA + silent schema-ownership coupling (A-C1) |
| F3 | Medium | 88/20 | streams/[id]/route.ts:44-75 | PUT /streams/[id] skips URL/team_id validation → streamlink argument injection |
| F4 | Low | 770 | supervisor start/stop/restart, syncGroups, addStream | Unauthenticated process-spawning routes, no rate limit |
| F5 | Low | 209 | setActive:57-59, getActive:28 | Raw error details leak server file paths outside dev |
| F6 | Low | 200 | obsStatus:29-33,82-96 | OBS host/port/version returned unauthenticated, no isDev gate |
| F7 | Low | 79 (transitive) | package.json→next→postcss<8.5.10 | npm audit: 2 moderate (postcss XSS in build toolchain) |
| F8 | Low | 20 | addStream:70, teams/[teamId] | role/team_name/group_* unbounded (no length cap) |
| F9 | Info | 89 (mitigated) | index.bun.ts:54, runtime.ts:122-143 | STREAMS_TABLE env reaches interpolated identifier; whitelist holds; validate-at-boot |

## MEDIUM

**F1 — Spoofable Host-header auth bypass (middleware.ts:16-25).** Two weaknesses: (1) fail-OPEN when API_KEY unset — all 24 routes open with only console.warn; `start.ts` binds next dev to 0.0.0.0 not loopback. (2) Host header is client-controlled; `Host: 192.168.1.250` or `Host: localhost` bypasses API-key check. Attack: co-network client POSTs /api/setActive, /api/setScene, /api/triggerTransition (force live cut), /api/addStream, DELETE /api/streams/:id, /api/supervisor/streams/[id]/stop. Medium not High because accepted posture under isolated-host model, but bypass is genuinely exploitable by in-scope co-network attacker and model collapses silently if host ever on shared LAN. Fix: don't trust Host for origin; fail CLOSED in production when API_KEY unset; bind next to 127.0.0.1 or firewall to loopback; delete 192.168/Host carve-out. **middleware.ts is completely untested** — add characterization suite first.

**F2 — Two SQLite writers, divergent durability PRAGMA + schema coupling (A-C1).** Traced PRAGMA: journal_mode WAL on both (CONSISTENT — no corruption), busy_timeout 5000 both, **synchronous unset on both (DIVERGENT — node-sqlite3 vs bun:sqlite may ship different compiled defaults; per-connection)**, wal_autocheckpoint 1000 Bun-only. Issue A: durability asymmetry — power-loss mid-broadcast can lose last `disabled` flip on the less-durable connection. Issue B: bunDatabase runs ZERO schema logic but opens RW and creates the file if absent; if supervisor is first to touch fresh sources.db (NSSM starts before webui) it creates empty DB, supervises zero streams, UPDATEs non-existent table; `loadStreamRows` broad catch (streamSpecsLoader.ts:53-61) swallows missing-table into legacy fallback, obscuring cause. **Medium not Critical** — webui boots first in reality; WAL+busy_timeout = block-and-retry not corruption. Fix: identical PRAGMA both openers + synchronous=NORMAL; supervisor fail-loud if table absent; narrow loadStreamRows catch; extend database.wal.test.ts to assert synchronous=1.

**F3 — PUT /streams/[id] argument injection (streams/[id]/route.ts:44-75).** PUT writes {name,obs_source_name,url,team_id,role} after only truthiness check — does NOT call isValidUrl (unlike addStream). Supervisor pushes url as positional arg to streamlink (commands.ts:30). url beginning `--` parsed as a streamlink option. team_id also unvalidated. **No shell (spawn argv, no shell:true anywhere) → no RCE/chaining**; impact confined to streamlink flag surface on operator's box via trusted-LAN write path. Rated Medium for validation inconsistency. Fix: mirror addStream validation (isValidUrl, isPositiveInteger); prepend `--` before streamlink URL positional.

## LOW
- **F4** Unauthenticated process-spawning routes no rate limit; only preview has MAX_CONCURRENT→429. Add per-route token bucket or bind to LAN/loopback.
- **F5** setActive:57-59 / getActive:28 pass raw error as details without isDev() gate (unlike apiHelpers). Leaks absolute server paths in prod. Gate behind isDev(), ideally centralize in createErrorResponse.
- **F6** obsStatus returns host/port/version/scene names unauthenticated, no isDev gate. Strip host/port/version; keep connected/hasPassword booleans.
- **F7** npm audit --omit=dev: 2 moderate, postcss <8.5.10 XSS (GHSA-qx2v-qp2m-jg93, CVSS 6.1) bundled in next@16.2.9 build toolchain — build-time not runtime. fixAvailable is FALSE signal (proposes next@9.3.3 downgrade — do NOT). Direct deps (ws, obs-websocket-js, sqlite3) clean. Track upstream next patch.
- **F8** role/team_name/group_name/group_uuid unbounded (validateBrandingFields covers only colors+logo_path). All flow to React-escaped JSX or cleanObsName (no shell). Apply 100-char cap via sanitizeString.

## INFO
- **F9** STREAMS_TABLE env → interpolated UPDATE identifier, re-guarded by assertSafeTableName whitelist (test-pinned). Operator-set env not request input. Harden: validate once at boot.

## Confirmed-safe (traced, don't re-litigate)
Command/shell injection NONE (spawn argv, no shell:true in app code; the 2 shell:true uses are build scripts w/ constant commands). Path traversal NONE (preview: Number()+anchored regex; setActive: enum-validated screen). SQL injection NONE (parameterized; identifiers from constants/whitelists; teams/[teamId] "SQLi" confirmed false positive). Stored XSS NONE (React-escaped; logoUrl isSafeLogoPath rejects `:` schemes; colors isHexColor; no dangerouslySetInnerHTML). SSRF NONE (login [A-Za-z0-9_]{1,30}, encodeURIComponent, fixed Helix host). Secrets sound (gitignored; OBS pwd `***`; Twitch token redacted; zero NEXT_PUBLIC_*; apiClient API_KEY read dead-code-eliminated for browser). Method guards 405; overlay no-store + force-dynamic.

## Myths to retire
1. "Mismatched journal_mode → corruption" — NOT present (both WAL, persistent property). Real gap is `synchronous` (durability) not journal_mode.
2. "SQL injection via table name" — NOT reachable (STREAMS_TABLE operator env + whitelist).
3. "Lost disabled writes / SQLITE_BUSY" — mitigated by WAL + busy_timeout=5000 (block-and-retry). Residual = up-to-5s write stall, not data loss.

## Top recommendations
1. Decide network boundary (F1): bind next to 127.0.0.1 or firewall to loopback; if shared LAN, set API_KEY + delete 192.168/Host carve-out + fail closed; add middleware.test.ts first.
2. Unify two SQLite openers (F2): synchronous=NORMAL + wal_autocheckpoint both; fail-loud schema check; narrow catch.
3. Validate URL/team_id in PUT /streams/[id] (F3); prepend `--`.
4. Centralize isDev() gating of error details (F5); trim obsStatus body (F6).
5. Cap string fields (F8); validate STREAMS_TABLE at boot (F9); track Next/postcss patch (F7).
