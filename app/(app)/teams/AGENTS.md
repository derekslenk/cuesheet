<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/teams

## Purpose
Route `/teams` rendering the **Team Management** page (`Teams`, `'use client'`). It lists teams (`GET /api/teams`) and lets the operator add (`POST /api/teams`), rename (`PUT /api/teams/:id`), and delete (`DELETE /api/teams/:id`, which also removes associated streams) teams. The page's distinctive job is keeping team records in sync with **OBS source-switcher groups**: "Verify Groups" (`GET /api/verifyGroups`) reports missing / orphaned / name-mismatched groups, "Sync All Groups" (`POST /api/syncGroups`) creates OBS groups for teams that lack one, and per-team actions cover create-group (`POST /api/createGroup`), clear-invalid, and update-name (both via `PUT /api/teams/:id`). Verification results annotate each team row with status badges (not found, name changed, linked-by-UUID).

## Key Files
| File | Description |
|---|---|
| `page.tsx` | `Teams`. Defines the local `GroupVerification` type; manages add/edit/delete plus group verify/sync/create/clear/rename. Per-team conditional buttons driven by the matching `GroupVerification` entry; inline edit mode with `editingTeam`/`editingName`. Uses many granular loading flags (`isVerifying`, `isSyncing`, `updatingTeamId`, `deletingTeamId`, etc.). |

## For AI Agents

### Working In This Directory
- The `Team` shape comes from `@/types`; `GroupVerification` is declared inline and mirrors the `/api/verifyGroups` response (`exists_in_obs`, `matched_by: 'uuid' | 'name' | null`, `current_name`, `name_changed`).
- Group matching can be by UUID or by name; UI badges reflect which (🆔 = linked by UUID). When OBS-side names drift, "Update Name" writes OBS's `current_name` back into the DB via `PUT /api/teams/:id` with `group_name`.
- This page uses native `confirm()`/`prompt()` for several destructive/create flows (delete team, sync all, clear invalid, update name, create group) alongside toasts — not custom modals like `app/streams`.
- Deleting a team cascades to its streams (per confirm copy and `/api/teams/:id`).

### Testing Requirements
No test file. Verify with the app running against a live OBS WebSocket: create a team, sync/create its group in OBS, rename the group in OBS, then re-verify to see the name-mismatch badge and "Update Name" path.

### Common Patterns
`fetchTeams()` re-run after each mutation; `verifyGroups()` called after group create/clear/rename to refresh badges; `useToast()` + `ToastContainer`; glass utility classes.

## Dependencies

### Internal
- `@/components/Toast` (`ToastContainer`) + `@/lib/useToast`
- `@/types` (`Team`)

### External
- `react`

<!-- MANUAL: notes below preserved on regeneration -->
