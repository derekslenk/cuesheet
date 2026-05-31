<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/streams

## Purpose
Route `/streams` rendering the **Streams** page (`AddStream`, `'use client'`) — the main place to create stream sources and browse existing ones grouped by team. On mount it fetches teams (`GET /api/teams`) and streams (`GET /api/streams`) in parallel. The add form takes a display name plus a Twitch username *or* URL (auto-extracted to a bare username and stored as `https://www.twitch.tv/<username>`), assigns a team, and posts to `POST /api/addStream`. Existing streams render via the inner `StreamsByTeam` component using `CollapsibleGroup` per team (plus a "No Team" bucket), each row offering "View Stream" and a delete action gated behind a glass confirmation modal (`DELETE /api/streams/:id`).

## Key Files
| File | Description |
|---|---|
| `page.tsx` | Default export `AddStream` (the page) plus the in-file `StreamsByTeam` helper component. Handles add-form validation (name ≥2 chars; Twitch username `^[a-zA-Z0-9_]{4,25}$`; required team), `extractTwitchUsername()` URL parsing, expand/collapse-all, and a delete-confirmation modal. |

## For AI Agents

### Working In This Directory
- `StreamsByTeam` is defined in the same file (not exported). It memoizes grouping with `useMemo`, sorts teams alphabetically with "No Team" (`teamId === -1`) last, and only renders non-empty groups. `CollapsibleGroup` defaults open when a group has ≤10 streams; "Expand/Collapse All" switches it to controlled mode (`useCustomExpanded`).
- `handleTeamSelect` carries a deliberate `@ts-expect-error` (formData `team_id` can be `null` but the setter is typed `number`); preserve or properly type it if refactoring.
- The submitted URL is always derived from the Twitch username — there is no free-form URL field here (unlike `app/edit/[id]`, which does expose a raw URL field).
- Delete from this page also removes the source from OBS (per the modal copy); it is not DB-only.

### Testing Requirements
No test file. Verify with the app running and a reachable API: add via username and via full URL, confirm both normalize correctly, and exercise grouping/expand/delete.

### Common Patterns
`useToast()` + `ToastContainer` for feedback; `useCallback`-wrapped `fetchData` re-run after mutations; inline-styled fixed-position modal; glass utility classes.

## Dependencies

### Internal
- `@/components/Dropdown`, `@/components/CollapsibleGroup`
- `@/components/Toast` (`ToastContainer`) + `@/lib/useToast`
- `@/types` (`Team`)

### External
- `react`

<!-- MANUAL: notes below preserved on regeneration -->
