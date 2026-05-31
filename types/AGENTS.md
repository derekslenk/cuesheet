<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# types

## Purpose

Shared TypeScript type definitions and ambient declarations for the CueSheet app. Holds the domain model types (`Stream`, `Team`, `Screen`) used across API routes and React components, plus a global ambient declaration that wires up `@testing-library/jest-dom` matchers and narrows `process.env.NODE_ENV`.

## Key Files

| File | Description |
|------|-------------|
| `index.ts` | Domain model types: `Stream` (id, name, obs_source_name, url, team_id), `StreamWithTeam` (adds `team_name` + optional `group_name`), `Screen` (screen + id), and `Team` (team_id, team_name, optional `group_name`/`group_uuid`). Mirrors the SQLite schema in `lib/database.ts`. |
| `jest-dom.d.ts` | Ambient declaration importing `@testing-library/jest-dom` and narrowing `NodeJS.ProcessEnv.NODE_ENV` to `'development' \| 'production' \| 'test'`. |

## For AI Agents

### Working In This Directory

- These types mirror the runtime SQLite schema (`lib/database.ts`) and the table columns added by `scripts/addGroupNameToTeams.ts` / `addGroupUuidColumn.ts` (`group_name`, `group_uuid`). Keep them in sync with both the schema and `docs/schema.md`.
- `jest-dom.d.ts` is consumed by the TypeScript/Jest config (ambient); it has no runtime export.

### Testing Requirements

- No tests live here. Type changes are validated by `tsc`/`next build` and by their consumers across `app/` and `components/`.

### Common Patterns

- Optional, nullable columns are typed `?: T | null` to match SQLite (`group_name`, `group_uuid`).

## Dependencies

### Internal

- Conceptually coupled to `lib/database.ts` (schema) and `lib/constants.ts` (table config).

### External

- `@testing-library/jest-dom` (ambient matcher types).

<!-- MANUAL: notes below preserved on regeneration -->
