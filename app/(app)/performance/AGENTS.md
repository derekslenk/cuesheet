<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/performance

## Purpose
Route `/performance` rendering the full-page **Performance Metrics** dashboard (`PerformancePage`, `'use client'`). It reads client-side timing data from `PerformanceMonitor` (`@/lib/performance`), polling `getAllMetrics()` every 2 seconds, and renders per-metric cards showing avg / min / max / count plus a color-coded bar (green <50ms, yellow <100ms, red otherwise) and a static "Performance Tips" panel. When no metrics have been collected it shows an empty-state message. Note: the `Perf` nav link to this page only appears in development (`NODE_ENV === 'development'`).

## Key Files
| File | Description |
|---|---|
| `page.tsx` | `PerformancePage`. Subscribes to `PerformanceMonitor.getAllMetrics()` via a 2s `setInterval`, formats metric labels (`snake_case` → Title Case), and renders metric cards + tips. Cleans up the interval on unmount. |

## For AI Agents

### Working In This Directory
- This is the standalone full-page view. A compact, dev-only floating variant lives in `components/PerformanceDashboard.tsx` — keep their metric formatting/thresholds consistent.
- Metric data is in-memory in the browser tab; it resets on reload and is per-tab.
- Thresholds (50ms / 100ms / 200ms bar scale) are duplicated literals — update both this page and the dashboard if you change them.

### Testing Requirements
No test file. Verify by running the app, generating activity (navigation, `fetchData`/`setActive` calls) so `PerformanceMonitor` records timings, then loading `/performance`.

### Common Patterns
Polling via `setInterval` with cleanup; `glass-panel` styling; Solarized-style utility color classes (`text-base1`, `text-green`, `text-blue`, `bg-base02`).

## Dependencies

### Internal
- `@/lib/performance` (`PerformanceMonitor`)

### External
- `react`

<!-- MANUAL: notes below preserved on regeneration -->
