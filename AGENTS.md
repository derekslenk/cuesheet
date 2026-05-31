<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

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
| `docs` | Architecture, runbooks, plugin contract, schema docs (see `docs/AGENTS.md`). |
| `types` | Shared TypeScript types (see `types/AGENTS.md`). |
| `public` | Static assets (see `public/AGENTS.md`). |
| `files` | Runtime data dir: SQLite DB(s) and the `${screen}.txt` switcher files (see `files/AGENTS.md`). |

## For AI Agents
### Working In This Directory
- Build: `npm run build`. Dev: `npm run dev`. Test: `npm test` (CI: `npm run test:ci`). Lint: `npm run lint`. Type-check: `npm run type-check`.
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
