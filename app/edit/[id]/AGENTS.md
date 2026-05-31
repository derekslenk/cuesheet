<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/edit/[id]

## Purpose
Dynamic route `/edit/:id` rendering the **Edit Stream** page (`EditStream`, a `'use client'` component). On mount it fetches the target stream (`GET /api/streams/:id`) and the team list (`GET /api/teams`) in parallel, hydrates a controlled form, and lets the operator update or delete the stream. Successful update (`PUT`) or delete (`DELETE`) shows a toast then redirects to `/` after ~1.5s. Loading and "stream not found" states render their own glass panels.

## Key Files
| File | Description |
|---|---|
| `page.tsx` | `EditStream` client page. Form fields: name, OBS source name, URL, team (via `Dropdown`). Client-side validation (name ≥2 chars, valid `URL`, required OBS source name, required team). Submits `PUT /api/streams/:id`; `Delete Stream` uses `confirm()` then `DELETE /api/streams/:id`. Uses `useParams`/`useRouter` from `next/navigation`. |

## For AI Agents

### Working In This Directory
- The local `Stream` type is declared inline here (`id`, `name`, `obs_source_name`, `url`, `team_id`); the shared `Team` type comes from `@/types`.
- Validation runs in `handleSubmit` before the network call; mirror it server-side rather than trusting it.
- Redirects are timed `setTimeout(() => router.push('/'), 1500)` — keep the delay in sync with toast duration if you change either.

### Testing Requirements
No dedicated test file. Verify against a running dev server with valid/invalid `:id` values and a reachable API. Component tests would need to mock `next/navigation` (`useParams`, `useRouter`) and `fetch`.

### Common Patterns
Controlled inputs with a `validationErrors` map cleared on change; `useToast()` + `ToastContainer` for feedback; glass-morphism utility classes (`glass`, `btn`, `input`, `title`, `subtitle`).

## Dependencies

### Internal
- `@/components/Dropdown` — team selector
- `@/components/Toast` (`ToastContainer`) + `@/lib/useToast`
- `@/types` (`Team`)

### External
- `react`, `next/navigation`

<!-- MANUAL: notes below preserved on regeneration -->
