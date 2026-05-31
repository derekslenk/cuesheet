<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# components/__tests__

## Purpose
Jest + React Testing Library unit tests for shared components. Coverage is currently limited to the two components with non-trivial, self-contained behavior: `ErrorBoundary` and `Toast`.

## Key Files
| File | Description |
|---|---|
| `ErrorBoundary.test.tsx` | Tests `../ErrorBoundary`: renders children when no error; shows the glass fallback (heading, copy, ⚠️) on throw; Refresh/Try Again buttons present; logs to `console.error`; custom `fallback` honored; dev-only error-details `<details>` shown in development and hidden in production (toggles `process.env.NODE_ENV`); verifies fallback container classes. |
| `Toast.test.tsx` | Tests `../Toast` with fake timers: `ToastComponent` renders title/message, per-type styling classes and icons, manual close (300ms fade then `onRemove`), auto-dismiss at default (5000ms) and custom durations, render-without-message. `ToastContainer` renders multiple toasts, renders nothing when empty, asserts positioning classes, and forwards `onRemove` per toast. |

## For AI Agents

### Working In This Directory
- These suites use `jest.useFakeTimers()` (Toast) — advance timers inside `act(() => jest.advanceTimersByTime(...))` and account for the 300ms exit-animation delay before `onRemove` fires.
- `ErrorBoundary` tests intentionally suppress `console.error` (expected React error logging) and mutate `process.env.NODE_ENV` via `Object.defineProperty` to exercise dev vs prod branches — restore it in `afterAll`.
- The "reload" test is effectively a no-op under jsdom (cannot mock `window.location.reload`); it only asserts the button is clickable.

### Testing Requirements
Run with `npm test` (Jest, jsdom env, `@testing-library/react`). Keep assertions tied to user-visible text/roles/classes already used by the components; update tests in lockstep with `Toast.tsx`/`ErrorBoundary.tsx` changes.

### Common Patterns
`render`/`screen`/`fireEvent`/`act` from Testing Library; fake timers; env-var toggling for environment-conditional UI; helper factories (`createToast`, `ThrowError`).

## Dependencies

### Internal
- `../ErrorBoundary`, `../Toast`

### External
- `@testing-library/react`, `jest`

<!-- MANUAL: notes below preserved on regeneration -->
