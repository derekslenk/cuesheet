<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# components

## Purpose
Shared, reusable React components for the CueSheet web UI — chrome (header/footer), form primitives (dropdown, collapsible group), feedback (toasts), authentication UI (API-key prompt/banner), resilience (error boundary), and a dev-only performance overlay. All are client components (`'use client'`) except the pure class-based `ErrorBoundary`. The UI brands as **CueSheet** ("Professional Control") in `Header` and `Footer`.

## Key Files
| File | Description |
|---|---|
| `Header.tsx` | App header/nav. CueSheet logo + links to Home, Streams, Teams, Settings; active link via `usePathname()`. The **Perf** link to `/performance` renders only in development. |
| `Footer.tsx` | Live OBS status bar. Smart-polls `GET /api/obsStatus` (15s connected / 30s disconnected) and `GET /api/counts` (60s) via `useSmartPolling`; shows connection dot, streaming/recording/studio-mode badges, current/preview scene, scene count, DB team/stream counts, errors, and OBS + WebSocket versions. |
| `Dropdown.tsx` | Generic single-select dropdown over `{id, name}[]`. Renders the menu in a `createPortal` to `document.body` with fixed positioning recomputed on scroll/resize; supports controlled (`isOpen`/`onToggle`) or uncontrolled use; closes on outside click. |
| `CollapsibleGroup.tsx` | Accordion section with title, item count badge, and rotating chevron. Controlled (`isOpen`+`onToggle`) or uncontrolled (`defaultOpen`). |
| `Toast.tsx` | `ToastComponent` + `ToastContainer`. Slide-in/out notifications (success/error/warning/info) with icon, auto-dismiss (default 5000ms), and manual close. Exports the `Toast`/`ToastType` types. |
| `ApiKeyPrompt.tsx` | `ApiKeyPrompt` modal and `ApiKeyBanner`. Validate-then-save flow against `GET /api/obsStatus` with `x-api-key`; banner shows authenticated/unauthenticated state and change/logout actions. Uses `useApiKey()`. |
| `ErrorBoundary.tsx` | Class component catching render errors; glass fallback with Refresh/Try Again, optional custom `fallback`, and a dev-only error-stack `<details>`. |
| `PerformanceDashboard.tsx` | Dev-only floating "📊 Perf" button opening a compact metrics overlay from `PerformanceMonitor` (2s poll). Returns `null` outside development. |

## Subdirectories
| Subdirectory | Description |
|---|---|
| `__tests__/` | Jest + Testing Library specs for `ErrorBoundary` and `Toast` (see `__tests__/AGENTS.md`). |

## For AI Agents

### Working In This Directory
- Toast usage is two-part: the `useToast()` hook (`@/lib/useToast`) owns the toast array and `showSuccess`/`showError`, and pages render `<ToastContainer toasts={...} onRemove={...} />`. Don't instantiate toasts ad hoc.
- `Dropdown` portals its menu to `document.body` with a very high `zIndex` (999999) to escape overflow/stacking contexts — preserve the portal + fixed-position-recalc pattern if editing.
- `PerformanceDashboard` (compact overlay) and `app/performance/page.tsx` (full page) share metric formatting and thresholds — keep them consistent.
- `ApiKeyPrompt`/`ApiKeyBanner` and `app/settings/page.tsx` duplicate the same `/api/obsStatus` validation; auth state itself lives in `@/contexts/ApiKeyContext`.
- Branding strings ("CueSheet") live in `Header.tsx` and `Footer.tsx`.

### Testing Requirements
Only `ErrorBoundary` and `Toast` have tests (in `__tests__/`). When changing those, run the suite (`npm test`). New shared components should get colocated tests under `__tests__/`; mock `next/navigation` and `fetch` as needed.

### Common Patterns
`'use client'` components; glass-morphism utility classes (`glass`, `glass-panel`, `btn`, `btn-secondary`, etc.); polling via `useSmartPolling`/`setInterval` with cleanup; `createPortal` for overlays.

## Dependencies

### Internal
- `@/lib/performance` (`PerformanceMonitor`, `useSmartPolling`), `@/lib/useToast`
- `@/contexts/ApiKeyContext` (`useApiKey`)

### External
- `react`, `react-dom` (`createPortal`), `next/link`, `next/navigation`

<!-- MANUAL: notes below preserved on regeneration -->
