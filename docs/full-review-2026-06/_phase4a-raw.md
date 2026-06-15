# Phase 4A (raw) — Modern Framework & Language Standards Review

**Scope:** Next.js 16.2 (App Router) + React 19.2 + TS 6 + Tailwind 4 + ESLint 9. Multi-runtime Node/Bun/tsx, three tsconfigs.

**Headline:** Well-engineered, genuinely modern codebase. OBS v5 API, async App Router params, Bun/CLI split, strict mode, ESLint flat config all done correctly. Debt concentrated in: (1) Tailwind 4 half-migrated (configs silently inert); (2) untyped obsClient.js boundary propagating shims; (3) inconsistent API envelopes. React client pages predate React 19 features. No Critical production breakage.

## CRITICAL
None. (middleware auth-bypass is a security posture choice, covered in Phase 2.)

## HIGH
- **H1. Tailwind 4 half-migrated: both JS config files silently inert.** globals.css:1-3 uses v3 directives (@tailwind base/components/utilities) — v4 expects @import "tailwindcss" (PostCSS plugin shims old directives so it compiles, legacy path). tailwind.config.js + tailwind.config.ts NOT loaded at all — v4 dropped auto config discovery, needs explicit @config (grep confirmed zero @config/@theme/@plugin). Consequences: @tailwindcss/forms plugin NEVER applied (form resets silently absent); darkMode:'class', custom content globs, theme colors inert; the two config files CONTRADICT each other (.js has forms+pages/ glob; .ts has darkMode+theme colors+no forms). Fix: CSS-first @import "tailwindcss"; @plugin "@tailwindcss/forms"; @theme {...}; @custom-variant dark; DELETE both config files. **Verify app still renders — forms styling will visibly change once plugin actually loads.** Most likely silently mis-rendering today.
- **H2. lib/obsClient.js untyped 1,404-line CJS; "ESM-only" justification factually WRONG.** Stated reason (streamLabel.js:3-6 "obs-websocket-js is ESM-only, can't require under jest") disproven: obs-websocket-js@5.0.6 is dual-published with require condition; require() succeeds under Node; obsClient.js:1 already does require('obs-websocket-js'); no test ever requires obsClient.js (AGENTS.md:25). Real consequence: allowJs:true but NO checkJs, NO @ts-check → 1,404-line body never type-checked, exports surface as implicit any. Fix: correct false comments; convert →.ts post-event (blocker gone); interim @ts-check + JSDoc. (The v5 call API itself is used perfectly.)
- **H3. Hand-written interface OBSClient shims drift from / erase real v5 types.** ~5 route files (addStream:9-11,136; verifyGroups:21-28,44; setScene:36; getCurrentScene:9) hand-roll {call:(method:string,params?:Record<string,unknown>)=>Promise<Record<string,unknown>>}. v5 ships first-class generics call<T extends keyof OBSRequestTypes>(...). Shim degrades method to bare string (typo compiles), forces `as unknown as` casts (addStream:136, verifyGroups:44), unchecked field access. Fix: types/obsClient.d.ts typing getOBSClient():Promise<OBSWebSocket>, delete shims+casts. Subsumed by H2.
- **H4. API response envelopes inconsistent across 24 routes.** apiHelpers {success,data,timestamp} (~10 routes) vs bare ad-hoc {message}/{error,details} (setActive:53) vs mixed (import withErrorHandling but raw NextResponse.json). Clients special-case each endpoint. Fix: route all through withErrorHandling + createSuccessResponse/createErrorResponse (helper exists, good). Migrate holdouts (setActive, setScene, getCurrentScene, getTeamName, obsStatus, counts, triggerTransition, syncGroups). Biggest API consistency win, low-risk per-route.

## MEDIUM
- **M1. React client pages predate React 19** (streams 805ln, teams 705ln, edit, settings). All on React-18 manual fetch+useEffect+useState+isSubmitting. Zero forwardRef/useActionState/useOptimistic/use() (grep-confirmed). Forms hand-roll preventDefault+pending+fetch (Actions collapse this). Optimistic state hand-rolled with manual revert (page.tsx:148-152, textbook useOptimistic). Medium: correct but ergonomics/consistency.
- **M2. Mega-pages no row memoization → re-render storm every poll.** streams/page.tsx polls health 5s (setStatusBySource), re-renders entire StreamsByTeam + every inline-mapped row (186-296), none React.memo. Grouping correctly useMemo'd but lost to parent re-render. Fix: memoized <StreamRow> (primitive props not whole Map/Set) + hooks useSupervisorHealth/useStreamControls.
- **M3. Raw setInterval health poll bypasses existing visibility-gated hook.** App ships useSmartPolling (performance.ts:147-204) with visibilitychange gating, used on home page. Hottest poll (supervisor health 5s, streams/page.tsx:384-388) uses raw setInterval, never pauses when tab hidden. Fix: useSmartPolling(pollHealth,5000,[]). (StreamLabel.tsx:66 30s poll defensibly raw — OBS browser sources don't fire visibilitychange reliably.)
- **M4. Triple-duplicated supervisor bootstrap** (index.ts:40-92, index.bun.ts:40-92, supervisor.bun.ts:30-94). main() wiring + envInt repeated ~verbatim ×3; only 2 lines differ (sqlite3 vs bun:sqlite; disk-read vs import-attr dashboard). supervisor.bun.ts:81-84 has a Ctrl-C re-entrancy guard the other two LACK. Fix: extract bootSupervisor({db,dashboardHtml,env,logDir,emit}); propagate guard.
- **M5. Two conflicting PostCSS configs tracked** (postcss.config.js has autoprefixer; postcss.config.mjs doesn't). .js wins (cosmiconfig resolves CJS first), .mjs is latent trap. Under TW4 autoprefixer largely redundant (Lightning CSS). Fix: delete .mjs.

## LOW
- L1 @ts-expect-error at streams/page.tsx:488 curable (type state team_id:number|null like edit/[id] does — needs no suppression).
- L2 target:"ES2017" stale for node>=22 — bump ES2022 (low impact, Next/SWC controls bundle, but config misleading).
- L3 supervisor uses bare core specifiers (http/fs/path) while CLI uses node: — normalize to node: (safer for Bun-compiled).
- L4 ws declared top-level dep but no first-party import (transitive of obs-websocket-js) — verify npm ls ws, demote/annotate. (bufferutil optionalDependency never imported is CORRECT — leave.)
- L5 spawn as never ×3 → as unknown as SpawnFn; validity ! in streamSpecsLoader/runtime → make isValidRow a type-guard.
- L6 native confirm()/prompt() (teams) vs glass modals (streams) inconsistent UX; useToast.ts:15 deprecated substr→slice/randomUUID; withPerformanceMonitoring HOC (performance.ts:128-144) dead — delete.

## Already correct / idiomatic (call out, no action)
- C1 obs-websocket-js v5 API textbook (obs.call('Req',params), connect signature, PascalCase events, obs.identified, 100% async/await, no v4 patterns).
- C2 Next 16 async dynamic APIs awaited everywhere (all 8 dynamic handlers type params:Promise<...> and await; force-dynamic/runtime correct).
- C3 Server vs Client boundary correct (layouts server; overlay async server component delegating to client StreamLabel; ApiKeyProvider scoped to (app) so overlays provider-free; deliberate raw <img> in StreamLabel.tsx:100 for CEF correctly justified — DO NOT convert).
- C4 ESLint 9 flat config exemplary; lint IS run in CI (build.yml:81-82, Node 22+24).
- C5 strict:true all three tsconfigs; 58 any almost all in __tests__; CLI/supervisor use unknown+narrowing on catch; three-tsconfig split coherent + each gated in CI.
- C6 Bun integration clean (bun:sqlite behind MinimalDb adapter; current with{type:'text'} import attributes; commander 15 fluent API + parseAsync().catch(); process.exitCode discipline; args-array spawns no shell; windowsHide).
- C7 streamLabel.js/labelLayout.js are the model (pure, DI, unit-tested, LABEL_RENDERER=html confirmed documented default); ci-ok aggregate-gate well-reasoned; database.ts uses promise sqlite wrapper over sqlite3 + WAL + busy_timeout + whitelists DDL identifiers.

**Bottom line:** Strong shape, modern where it counts. Four High findings are consistency/typing/config-hygiene, not runtime breakage — H1 (Tailwind) is the one most likely silently mis-rendering today, worth browser verification. React modernizations (M1-M3) real but optional polish, defer behind event freeze.
