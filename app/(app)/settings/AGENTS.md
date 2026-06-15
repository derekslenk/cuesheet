<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/settings

## Purpose
Route `/settings` rendering the **Settings** page (`SettingsPage`, `'use client'`), whose sole concern is API-key authentication. It reads/writes the key through `useApiKey()` (`@/contexts/ApiKeyContext`). Entering a key validates it by calling `GET /api/obsStatus` with an `x-api-key` header; a `200` saves the key (to `localStorage`, via the context) and shows success, anything else shows "Invalid API key". The page also surfaces current auth status and a "Clear Key" action. Per the on-page notes, keys are only required for external-network access; local access bypasses auth.

## Key Files
| File | Description |
|---|---|
| `page.tsx` | `SettingsPage`. Password input + form; `handleSubmit` validates the key against `/api/obsStatus`; `handleClearKey` clears it. Shows status dot (green = authenticated, yellow = none), inline error/success panels, and an informational list. |

## For AI Agents

### Working In This Directory
- Persistence and the `isAuthenticated` flag live in `@/contexts/ApiKeyContext` (`localStorage` key `obs-api-key`), not here. This page only drives that context.
- `ApiKeyPrompt`/`ApiKeyBanner` (`@/components/ApiKeyPrompt`) implement the same validate-then-save flow as a modal/banner; keep behavior aligned if you change validation.
- Styling uses `glass-panel` and Solarized-ish color classes, with several inline-style overrides on the input.

### Testing Requirements
No test file. Verify with the app running: a valid key should persist across reloads (localStorage) and flip the status to "Authenticated"; an invalid key should error without saving.

### Common Patterns
Context-driven auth state; `fetch` with custom header for validation; local `error`/`success`/`isLoading` UI state.

## Dependencies

### Internal
- `@/contexts/ApiKeyContext` (`useApiKey`)

### External
- `react`

<!-- MANUAL: notes below preserved on regeneration -->
