<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/streams

## Purpose
Route `/streams` rendering the **Streams** page (`AddStream`, `'use client'`) — the main place to create stream sources and browse existing ones grouped by team. On mount it fetches teams (`GET /api/teams`) and streams (`GET /api/streams`) in parallel. The add form takes a display name plus a Twitch username *or* URL (auto-extracted to a bare username and stored as `https://www.twitch.tv/<username>`), assigns a team, and posts to `POST /api/addStream`. Existing streams render via the inner `StreamsByTeam` component using `CollapsibleGroup` per team (plus a "No Team" bucket), each row offering "View Stream", supervisor **Start / Stop / Restart** controls, a preview toggle, and a delete action gated behind a glass confirmation modal (`DELETE /api/streams/:id`).

The page polls `GET /api/supervisor/health` every 5 s for live per-stream status (matched by `obs_source_name`) and renders a status badge (Running / Crashed / Stopped / Unknown). Start posts `POST /api/supervisor/streams/:id/start`, Stop posts `.../stop` (behind a confirmation modal), and Restart posts `.../restart` (behind a confirmation modal). Those routes **forward to the supervisor** (which owns the durable `disabled` write); when the supervisor is unreachable they **break-glass** to a direct DB write (`disabled=0`/`1`) and return `degraded: true`, which the page surfaces as a "Saved — supervisor offline" toast (the flag applies on the next supervisor reconcile). Restart never writes the DB. The page no longer optimistically flips `disabled` locally — status comes from the authoritative health poll. When the supervisor is unreachable the badge falls back to the DB `disabled` flag (Stopped/Unknown). Buttons are status-gated and disabled per-stream while an action is in flight.

## Key Files
| File | Description |
|---|---|
| `page.tsx` | Default export `AddStream` (the page) plus the in-file `StreamsByTeam` helper component. Handles add-form validation (name ≥2 chars; Twitch username `^[a-zA-Z0-9_]{4,25}$`; required team), `extractTwitchUsername()` URL parsing, expand/collapse-all, a delete-confirmation modal, supervisor health polling, and Start/Stop/Restart actions (Stop/Restart gated by a shared confirmation modal). |

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
