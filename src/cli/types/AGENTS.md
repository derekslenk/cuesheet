<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# cli types (`src/cli/types`)

## Purpose
Ambient TypeScript declarations that let the bun-only supervisor code
type-check under the repo's `tsc` gate without pulling all of `bun-types` into
the global scope.

## Key Files
| File | Description |
| --- | --- |
| `bun-shims.d.ts` | Surgical shims for `bun:sqlite`, `*.html` module imports, and `import.meta.main` — the minimal bun surface the supervisor uses. |

## For AI Agents
### Working In This Directory
- Keep these shims **surgical** — declare only the bun APIs actually used. Pulling
  in full `bun-types` globally would mask real type errors in the webui code.
- When `*.bun.ts` files start using a new bun API, add a narrow declaration here
  rather than widening the global types.

### Testing Requirements
- No tests; correctness is observed through `npm run type-check` staying green.

## Dependencies
### Internal
- Consumed by the `*.bun.ts` modules in `../commands` (e.g.
  `supervisor.bun.ts`).
### External
- None at runtime; declarations describe the Bun runtime surface.

<!-- MANUAL: notes below preserved on regeneration -->
