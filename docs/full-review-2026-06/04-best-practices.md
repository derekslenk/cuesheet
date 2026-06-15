# Phase 4: Best Practices & Standards

**Target:** Whole repo (`cuesheet`).

**Headline:** The codebase is **genuinely modern where it counts** — obs-websocket-js v5 API, Next 16 async dynamic APIs, the Server/Client boundary, strict TypeScript, ESLint 9 flat config, and the Bun integration are all done correctly (extensively documented in the "Already correct" list below). The standards debt is **consistency/config-hygiene**, not runtime breakage — except for two items worth acting on: a **Tailwind 4 misconfiguration that is likely mis-rendering forms today**, and a **CI gate that smoke-tests the wrong-OS supervisor binary**, giving false confidence before event day.

---

## Framework & Language Findings (Phase 4A)

### Critical
None in the modern-standards dimension.

### High
| ID | Finding | Location |
|----|---------|----------|
| F-H1 | **Tailwind 4 is half-migrated — both JS config files are silently inert.** `globals.css` uses v3 `@tailwind` directives; v4 dropped auto-discovery of `tailwind.config.*` (no `@config` exists). Result: `@tailwindcss/forms` is **never applied**, `darkMode`/theme colors are dead, and the two config files contradict each other. **Most likely silently mis-rendering today — verify in a browser.** | `app/globals.css:1-3`, `tailwind.config.{js,ts}` |
| F-H2 | **`lib/obsClient.js` is untyped 1,404-line CJS and the "ESM-only" justification is factually wrong** (obs-websocket-js@5 is dual-published; `require` works; no test imports obsClient.js). With `allowJs` but no `checkJs`/`@ts-check`, the whole module body is never type-checked. | `lib/obsClient.js`, `lib/streamLabel.js:3-6` |
| F-H3 | **Hand-written `interface OBSClient` shims erase the real v5 generic types** (`call<T extends keyof OBSRequestTypes>`), degrading request names to bare `string` (typos compile) and forcing `as unknown as` casts. | `addStream/route.ts:9-11,136`, `verifyGroups`, `setScene`, `getCurrentScene` |
| F-H4 | **API response envelopes inconsistent across 24 routes** — `apiHelpers` standard vs bare ad-hoc vs mixed. *(Same root as Q-H1/A-H1/D-H1.)* | `lib/apiHelpers.ts` + holdout routes |

### Medium
- **F-M1** React client pages predate React 19 (zero `useActionState`/`useOptimistic`/`use()`); forms and optimistic state are hand-rolled — correct but ergonomic debt.
- **F-M2** Mega-pages have no row memoization → full re-render storm every 5s poll. Extract a memoized `<StreamRow>` + custom hooks.
- **F-M3** The hottest poll uses raw `setInterval` and **bypasses the repo's own `useSmartPolling`** (which already has `visibilitychange` gating). One-line fix. *(Same theme as P-H4.)*
- **F-M4** Triple-duplicated supervisor bootstrap across three entrypoints; only one has the Ctrl-C re-entrancy guard. Extract `bootSupervisor()`.
- **F-M5** Two conflicting PostCSS configs tracked (`.js` with autoprefixer wins; `.mjs` is a latent trap). Delete the `.mjs`.

### Low
`@ts-expect-error` at `streams/page.tsx:488` is curable by typing the state `team_id: number | null`; `target: ES2017` is stale for Node 22 (bump ES2022); supervisor uses bare `http`/`fs` specifiers vs the CLI's `node:` (normalize); `ws` is a top-level dep with no first-party import (demote/annotate — `bufferutil` optional is correct); `spawn as never` / validity `!` could be type-guards; native `confirm()`/`prompt()` vs glass modals inconsistent, deprecated `substr`, dead `withPerformanceMonitoring` HOC.

### Already correct / idiomatic (no action — preserve)
obs-websocket-js **v5 API is textbook**; **Next 16 async `params` awaited in all 8 dynamic handlers**; Server/Client boundary correct (incl. the deliberately-justified raw `<img>` in the CEF overlay — **do not convert**); **ESLint 9 flat config is exemplary and lint runs in CI**; `strict: true` across all three coherent tsconfigs with near-zero `any` outside tests; Bun integration clean (`bun:sqlite` behind a `MinimalDb` adapter, current import attributes, commander 15 fluent API); `streamLabel.js`/`labelLayout.js` are the model (pure, DI, tested), and `LABEL_RENDERER=html` is confirmed the documented default.

---

## CI/CD & DevOps Findings (Phase 4B)

> Calibrated to a solo-operator single-host event tool. The bar: *can the pipeline catch a broken Windows Bun binary or a broken deploy before event day?*

### Critical
| ID | Finding | Location |
|----|---------|----------|
| O-C1 | **The blocking supervisor smoke validates the wrong-OS binary.** The `supervisor-binary` job runs on `ubuntu-latest` and smokes the host-native **Linux ELF** (`supervisor:build`), but the artifact shipped to the OBS host is the **Windows** `--target=bun-windows-x64` cross-compile. The one bug class the smoke exists to catch — a Bun compile/boot failure of the daemon — is exactly what can differ between Linux and Windows Bun runtimes, and the boot-order failure (A-C1) only manifests in the compiled path (and the smoke seeds its own DB, so it never reproduces A-C1). **A broken Windows `.exe` passes `ci-ok` green.** | `.github/workflows/build.yml`, `scripts/smokeSupervisorBinary.mjs:50` |

### High
- **O-H1** Boot-order dependency (A-C1) is **enforced nowhere** in deploy automation — `doctor.ts:113` deliberately doesn't check for `sources.db`/the season table, and NSSM auto-restart turns a cold-boot-before-webui into a 1s crash-loop. Add a schema preflight (clean exit, don't let NSSM hammer) + a runbook sequencing step.
- **O-H2** **No supply-chain or secret scanning in CI** (no `npm audit`/dependency-review/CodeQL/gitleaks). Renovate is well-configured but gated on installing the Mend app (not yet done). With live Twitch creds in `.env.local` + fail-open middleware, an accidental secret commit would be uncaught. Add an advisory→blocking `security` job to `ci-ok`'s `needs:`.

### Medium
- **O-M1** CI actions pinned to mutable tags, not SHAs (priority: the third-party `dorny`/`oven-sh`/`softprops` actions; release.yml has `contents: write`).
- **O-M2** `.forgejo` mirror CI has drifted — omits tests, the bun/deck type-checks, and the supervisor smoke; uses EOL `upload-artifact@v3`. Bring to parity or explicitly demote to advisory.
- **O-M3** No `timeout-minutes` and no `concurrency.cancel-in-progress` — a hung Bun smoke can run to the 6-hour default; a stuck `ci-ok` silently blocks merges.
- **O-M4** `RUNBOOK_FALLBACK.md` ships **`TODO(operator)` placeholders in the emergency paths** — the entire §3 hotkey table (including the load-bearing BRB binding) is unfilled. Treat "zero TODOs in the fallback runbook" as a doors-don't-open gate.
- **O-M5** Stale `release/` tree (binaries dated 2026-06-08) + ~700 MB of `*.bun-build` litter in the working tree — a staleness/disk trap; `git clean -fdX` and add a "verify deployed version via /health" runbook step.

### Low
- **O-L1** Coverage gate (70%) intentionally not enforced — **the right call**; optionally emit a non-blocking coverage trend. Don't raise the threshold pre-event.
- **O-L2** `ci-ok` `needs:` is well-constructed (all three tsconfigs + lint + sqlite audit + both smokes ARE gated), but the deck/bun type-checks are wired *inside* unrelated jobs to avoid a ruleset edit — a future job split could silently drop a type gate. Document which job owns each `type-check:*`.
- **O-L3** Per-job `permissions` hardening incomplete — add a top-level `permissions: { contents: read }` to `build.yml`.
- **O-L4** Supervisor control endpoints are loopback-only/no-auth (the right model); the webui's spoofable `Host: 192.168.*` bypass (S-F1) is the soft spot — bind Next to loopback / firewall :3000 on the host.

### Already done well (preserve / replicate)
The **`ci-ok` aggregate-gate pattern** (correctly solves the path-filter-deadlock + matrix-rename-staleness; extend `needs:`, never edit the ruleset); the **supervisor binary is boot-smoked** (not just type-checked) and isolated from real run-state — only the OS target is wrong; **secret hygiene is clean** (no `.env*` tracked; the live Twitch token is nowhere in git history; `redact.ts` strips it from logs); the **rollback kit + `event-safe` git tag** (`event-safe-2026-06-13` confirmed) with three independently-rollable surfaces; **versioned, traceable release artifacts**; the metrics-scraper **scheduled-task IaC** (the model the NSSM install should follow); a thoughtful **Renovate config**; and solid single-host **observability** (supervisor `/health`, `/api/overlay/health` counters, the obs64 working-set scraper, runbook RAM thresholds).

---

## Summary

| ID | Sev | Dimension | One-line |
|----|-----|-----------|----------|
| O-C1 | Critical | CI/CD | Supervisor smoke boots a Linux binary for a Windows deployment — false-green gate |
| F-H1 | High | Framework | Tailwind 4 configs silently inert (`@tailwindcss/forms` + theme dead) — likely mis-rendering now |
| F-H2 | High | Language | `obsClient.js` untyped CJS; "ESM-only" justification is false |
| F-H3 | High | Language | Hand-written `OBSClient` shims erase v5 types |
| F-H4 | High | Framework | 3 API response envelopes across 24 routes |
| O-H1 | High | DevOps | Boot-order (A-C1) enforced nowhere; NSSM crash-loop risk |
| O-H2 | High | DevOps | No supply-chain/secret scanning in CI |
| F-M1..M5, O-M1..M5 | Medium | — | React-19 modernization, memoization, polling hook, supervisor dedup, PostCSS/Tailwind config; CI SHA-pinning, forgejo parity, timeouts, runbook TODOs, release hygiene |

**Bottom line:** Modern and well-run for a single-host tool. The two items that genuinely warrant pre-event attention are **F-H1 (Tailwind — verify the UI renders correctly)** and **O-C1 (make the CI smoke build the Windows binary it actually ships)**. Everything else is consistency/hygiene that can be scheduled behind the event freeze.
