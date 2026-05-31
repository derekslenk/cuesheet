<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# api/__tests__

## Purpose
Jest tests for the API layer. Route handlers are tested in isolation by mocking `lib/database`, `lib/apiHelpers`, and `lib/obsClient`, plus a repo-wide drift guard that asserts no runtime route hard-codes a table `year`.

## Key Files
| File | Description |
| --- | --- |
| `streams.test.ts` | Tests `GET /api/streams` (import from `../streams/route`) with mocked DB/apiHelpers; asserts the team-joined stream list. |
| `teams.test.ts` | Tests `GET /api/teams` with mocked DB, apiHelpers, and obsClient. |
| `yearHardcodeGuard.test.ts` | Walks every `app/api/**/route.ts` (skipping `__tests__`) and fails if any contains a literal `year: <4 digits>`, preventing split-brain table reads when `DEFAULT_TABLE_CONFIG.year` is bumped. Uses an `ALLOWLIST` for intentional exceptions. |

## For AI Agents
### Working In This Directory
- Tests mock via `@/lib/*` path aliases; the global `jest.setup.js` mocks `next/server`'s `NextResponse.json`, `next/navigation`, `fetch`, and `confirm`.
- When adding a route that legitimately needs a non-default year, register it in the guard's `ALLOWLIST` with a justifying comment.

### Testing Requirements
- Run `npm test` (or `npm run test:ci` for coverage) from repo root. Coverage thresholds are 70% global.

## Dependencies
### Internal
- Route handlers under `app/api/**`, `lib/constants`.
### External
- `jest`, `@testing-library/*` (via shared config).

<!-- MANUAL: notes below preserved on regeneration -->
