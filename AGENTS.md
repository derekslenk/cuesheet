<!-- Generated: 2026-05-31 | Updated: 2026-06-08 -->

# CueSheet

## Purpose
CueSheet (npm package `cuesheet`) is a Next.js 15 / React 19 web app for controlling OBS Studio during live-stream production. It manages teams and streams in a SQLite database and drives OBS two ways: over obs-websocket-js for scene/group/transition orchestration and status, and — for the live source-switching hot path — by writing per-screen `${screen}.txt` files that the external **obs-source-switcher** OBS plugin (github.com/exeldro/obs-source-switcher) polls. Note: obs-source-switcher is the third-party plugin CueSheet drives, not this project.

## Key Files
| File | Description |
| --- | --- |
| `package.json` | Project manifest (name `cuesheet`). Scripts: `dev`, `build`, `start`, `lint`, `type-check`, `test`/`test:watch`/`test:coverage`/`test:ci`, plus many `tsx` maintenance/soak scripts. Deps: `next`, `react`, `obs-websocket-js`, `sqlite`/`sqlite3`, `ws`. |
| `middleware.ts` | Guards `/api/*`. Optional `API_KEY` auth via `x-api-key` header or `apikey` query param; bypassed for localhost/LAN and when `API_KEY` is unset (dev mode). |
| `config.js` | Exports `FILE_DIRECTORY()` — resolves `process.env.FILE_DIRECTORY` or `./files`, the directory holding the obs-source-switcher `${screen}.txt` files. |
| `next.config.ts` | Next config; `eslint.ignoreDuringBuilds: true`. |
| `tsconfig.json` | TS config; path aliases `@/*` → repo root, `@lib/*` → `lib/*`. |
| `jest.config.js` | Jest via `next/jest`; jsdom env, `@/*` mapping, 70% coverage thresholds. |
| `jest.setup.js` | Global mocks for `next/server`, `next/navigation`, `fetch`, `confirm`. |
| `tailwind.config.*`, `postcss.config.*` | Tailwind v4 / PostCSS setup. |
| `README.md` | Project overview and setup. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `app` | Next.js App Router: pages + `/api` route handlers (see `app/AGENTS.md`). |
| `components` | Shared React UI components (see `components/AGENTS.md`). |
| `contexts` | React contexts, e.g. `ApiKeyContext` (see `contexts/AGENTS.md`). |
| `lib` | Core logic: DB access, OBS client, atomic writes, constants, helpers, security (see `lib/AGENTS.md`). |
| `scripts` | `tsx`/Node maintenance, migration, soak, and latency scripts (see `scripts/AGENTS.md`). |
| `src` | Source for the unified **`cuesheet`** CLI binary (commander router + per-command modules + libs); built via `bun build --compile` into one cross-platform executable that replaces the old `.cmd`/`.ps1` launchers (see `src/cli/AGENTS.md`). |
| `docs` | Architecture, runbooks, plugin contract, schema docs (see `docs/AGENTS.md`). |
| `types` | Shared TypeScript types (see `types/AGENTS.md`). |
| `public` | Static assets (see `public/AGENTS.md`). |
| `files` | Runtime data dir: SQLite DB(s) and the `${screen}.txt` switcher files (see `files/AGENTS.md`). |
| `monitor` | Deprecated .NET WPF control panel, superseded by `cuesheet gui` (see `monitor/AGENTS.md`). |
| `obs-scene` | Reference OBS scene-collection exports + sample switcher `.txt` files (see `obs-scene/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- Build: `npm run build`. Dev: `npm run dev`. Test: `npm test` (CI: `npm run test:ci`). Lint: `npm run lint`. Type-check: `npm run type-check`.
- Unified launcher: the **`cuesheet`** binary (`src/cli`) replaces the removed root `.cmd`/`.ps1` scripts and runs on Windows/macOS/Linux. Build with `npm run binary:build:{win,mac,linux}`; dev via `npm run cli:dev -- <command>`. Commands: `dev`, `sup`, `start`, `stop`, `status`, `watch`, `gui`, `doctor`, plus ops passthroughs (`loadtest`, `soak`, `clean-obs`, …). `cuesheet sup` embeds the Streamlink supervisor in-process.
- OBS plugin contract: live source switching is performed by writing `${FILE_DIRECTORY}/${screen}.txt` (screen basenames in `lib/constants` `SCREEN_POSITIONS`); writes must be atomic (`lib/atomicWrite`) so the plugin never reads a torn file.
- Persistence is SQLite (`sqlite`/`sqlite3`); table names are resolved via `lib/constants` (`TABLE_NAMES`) and are season/year-aware — never hard-code a year.
- Two OBS deployment hosts exist (Mac dev, Windows prod); both run the source-switcher plugin and expose obs-websocket.

### Testing Requirements
- Jest with jsdom; tests under `**/__tests__`. Coverage thresholds are 70% (branches/functions/lines/statements). Run `npm test`.

### Common Patterns
- API responses increasingly use `lib/apiHelpers` wrappers; OBS calls go through the shared client in `lib/obsClient`.

## Dependencies
### Internal
- `lib/*` underpins `app/api/*` and the pages; `config.js` and `lib/constants` define the plugin/file and table contracts.
### External
- `next`, `react`/`react-dom`, `obs-websocket-js`, `sqlite`/`sqlite3`, `ws`, `tailwindcss`; tooling: `jest`, `ts-jest`, `tsx`, `typescript`, `eslint`.

<!-- MANUAL: notes below preserved on regeneration -->

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->
