# Schema notes

Source of truth: `lib/database.ts:22-33`

## Tables

### streams_{year}_{season}_{suffix}

Defined in `lib/database.ts:21-28`.

| Column           | Type    | Constraint                  | Notes                                    |
|------------------|---------|-----------------------------|------------------------------------------|
| id               | INTEGER | PRIMARY KEY AUTOINCREMENT   | Surrogate key — insertion-order only     |
| name             | TEXT    | NOT NULL                    | Display name of the stream               |
| obs_source_name  | TEXT    | NOT NULL                    | OBS source identifier                    |
| url              | TEXT    | NOT NULL                    | Stream URL                               |
| team_id          | INTEGER | NOT NULL                    | Implicit FK → teams.team_id (no FK decl) |

### teams_{year}_{season}_{suffix}

Defined in `lib/database.ts:31-36`.

| Column    | Type    | Constraint              | Notes                                              |
|-----------|---------|-------------------------|----------------------------------------------------|
| team_id   | INTEGER | PRIMARY KEY             | **No AUTOINCREMENT** — manually-assigned semantic ID |
| team_name | TEXT    | NOT NULL                | Human-readable team name                           |

## Why the asymmetry?

`streams.id` uses `AUTOINCREMENT` because it is a pure surrogate key — its value carries no meaning outside the database.

`teams.team_id` intentionally **omits** `AUTOINCREMENT` because team IDs are public-facing semantic numbers (commentators say "team 7"; scoreboards display "team 7"). Allowing SQLite to auto-assign them would make the ID depend on insertion order, which is fragile across import/export cycles and event restarts. The value must be set explicitly at insert time to match the official event roster.

## Implicit foreign key

`streams.team_id` references `teams.team_id` by convention. There is **no declared `FOREIGN KEY` constraint** in the current SQLite schema. This is intentional for the event-day SQLite era: FK enforcement would complicate bulk imports and late-arriving team data. The relationship is enforced at the application layer.

## Post-event (R1 — Postgres migration)

When migrating to Postgres after the event:

- Add explicit FK: `streams.team_id → teams.team_id ON DELETE RESTRICT`
- Consider `BIGINT GENERATED ALWAYS AS IDENTITY` for `streams.id`
- Keep `teams.team_id` as a plain `PRIMARY KEY` (no identity/sequence) — manual assignment must be preserved
