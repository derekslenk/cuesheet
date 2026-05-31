<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# streams

## Purpose
`GET /api/streams` lists all streams joined to their team (`team_name`, `group_name`). Pure DB read. Per-stream operations (GET/PUT/DELETE one stream) live in the `[id]` subdirectory.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | `GET` handler wrapped in `withErrorHandling`. `LEFT JOIN`s `TABLE_NAMES.STREAMS`↔`TEAMS` and returns the rows as `StreamWithTeam[]`. |

## Subdirectories
| Dir | Purpose |
| --- | --- |
| `[id]` | Single-stream GET/PUT/DELETE, including OBS + text-file cleanup on delete (see `[id]/AGENTS.md`). |

## For AI Agents
### Testing Requirements
- `app/api/__tests__/streams.test.ts` mocks `lib/database` and `lib/apiHelpers`. Run `npm test` from repo root.

## Dependencies
### Internal
- `lib/database`, `lib/constants` (`TABLE_NAMES`), `lib/apiHelpers`, `types` (`StreamWithTeam`).
### External
- `sqlite`.

<!-- MANUAL: notes below preserved on regeneration -->
