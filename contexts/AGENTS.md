<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# contexts

## Purpose
React context providers shared across CueSheet's client components. Currently this is the API-key authentication context, which persists the operator's API key in `localStorage` and exposes auth state/actions app-wide.

## Key Files
| File | Description |
|---|---|
| `ApiKeyContext.tsx` | `'use client'`. Exports `ApiKeyProvider` and the `useApiKey()` hook. State: `apiKey`, `isAuthenticated` (`Boolean(apiKey)`). Actions: `setApiKey(key)` and `clearApiKey()`, both syncing the `localStorage` key `obs-api-key`. Loads the stored key on mount and renders a `Loading...` placeholder until the initial read completes (avoids hydration flicker). `useApiKey()` throws if called outside the provider. |

## For AI Agents

### Working In This Directory
- The single source of truth for the API key is `localStorage['obs-api-key']`. The settings page (`app/settings/page.tsx`) and `components/ApiKeyPrompt.tsx` both drive this context rather than touching storage directly — route new auth UI through `useApiKey()` too.
- `ApiKeyProvider` must wrap any tree that calls `useApiKey()`; it is typically mounted in the root layout. The provider deliberately blocks rendering its children until `isLoaded` is true.
- Validation (testing the key against `/api/obsStatus`) is done by callers, not by this context — the context only stores/clears.

### Testing Requirements
No test file. If adding tests, mock `localStorage` and assert that `setApiKey`/`clearApiKey` update both storage and `isAuthenticated`, and that `useApiKey()` throws outside a provider.

### Common Patterns
`createContext` + custom hook with an undefined-default guard; `useEffect` hydration of persisted state with an `isLoaded` gate.

## Dependencies

### Internal
- Consumed by `app/settings/page.tsx`, `components/ApiKeyPrompt.tsx`.

### External
- `react`

<!-- MANUAL: notes below preserved on regeneration -->
