<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app

## Purpose
The Next.js 15 App Router root for CueSheet. It defines the shared root layout (header/footer, error boundary, API-key context) and the operator pages — the home switcher board plus team/stream management, settings, and performance views — alongside the `/api` route handlers that back them.

## Key Files
| File | Description |
| --- | --- |
| `layout.tsx` | Root layout. Sets metadata (`title: 'CueSheet'`), wraps children in `ApiKeyProvider`, `Header`, `Footer`, and `ErrorBoundary`. |
| `page.tsx` | Home page (`'use client'`): the live switcher board. Lists streams, shows the active source per screen (`SCREEN_POSITIONS`), and drives `setActive`. |
| `globals.css` | Global Tailwind styles. |
| `favicon.ico` | App favicon. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `api` | App Router API layer (DB + OBS orchestration) (see `api/AGENTS.md`). |
| `edit` | `edit/[id]` stream-edit page (see `edit/[id]/AGENTS.md`). |
| `streams` | Stream management page. |
| `teams` | Team management page. |
| `settings` | Settings / OBS-status page. |
| `performance` | Performance dashboard page. |
| `fonts` | Local Geist font files. |

## For AI Agents
### Working In This Directory
- Pages are React 19 client components that call the `/api/*` routes via `lib/apiClient`; screen identifiers come from `lib/constants` (`SCREEN_POSITIONS`).
- The `ApiKeyProvider` context supplies the `x-api-key` used to satisfy `middleware.ts` when an `API_KEY` is configured.

### Testing Requirements
- Component/route tests live under `app/api/__tests__` and `components/__tests__`. Run `npm test` from repo root.

## Dependencies
### Internal
- `components/*`, `contexts/ApiKeyContext`, `lib/*`, `types`.
### External
- `next`, `react`, `react-dom`, `tailwindcss`.

<!-- MANUAL: notes below preserved on regeneration -->
