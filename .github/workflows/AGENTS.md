<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# .github/workflows

## Purpose
GitHub Actions CI/CD for CueSheet: lint/test/build on push & PR to `main`, the
cross-platform `cuesheet` binary build+smoke matrix, releases, and the Claude
Code review/assistant automations.

## Key Files
| File | Description |
| --- | --- |
| `build.yml` | "ci" — the ONLY workflow with a required check (`ci-ok`, an aggregate gate job). Jobs: `web` (lint/test/build, Node 20 & 22), `supervisor-binary` (bun type-check + supervisor smoke, blocking), `cli-binary` (per-OS `cuesheet` build+smoke, path-conditional via `changes`/dorny paths-filter — skips report success to the gate). Absorbed the old `cuesheet-binary.yml`. |
| `release.yml` | Release pipeline (tag/version → artifacts). |
| `claude.yml` | Claude Code assistant workflow (issue/PR automation). |
| `claude-code-review.yml` | Automated Claude Code review on PRs. |

## For AI Agents
### Working In This Directory
- Keep `build.yml` in sync with the npm scripts it invokes (`lint`/`test`/
  `build`, `type-check:bun`, `supervisor:smoke`, `binary:build:*`) — a renamed
  script must be updated here too.
- **Branch protection requires ONLY `ci-ok`.** When adding/renaming jobs,
  update its `needs:` list — never add a job name to the GitHub ruleset, and
  never put a required check behind a workflow-level `paths:` filter (that
  deadlocks out-of-scope PRs — see PR #22).
- CLI binary smoke checks stay **read-only** (`--help`, `status --json`,
  `doctor`). The supervisor smoke (`scripts/smokeSupervisorBinary.mjs`) does
  boot the compiled supervisor, but only against a throwaway temp DB on an
  ephemeral port with `SUPERVISOR_PORT_GUARD=off` — it must never touch a real
  supervisor, run-state.json, or kill processes.
- The self-hosted Forgejo mirror is `.forgejo/workflows/build.yml`; keep the two
  CI definitions conceptually aligned.

### Testing Requirements
- Validated by CI itself; no local Jest coverage. Lint YAML before pushing.

## Dependencies
### Internal
- `package.json` scripts (`lint`, `test`, `build`, `binary:build:*`,
  `binary:smoke`).
### External
- GitHub Actions runners (ubuntu + per-OS matrix), `actions/checkout`, Node
  setup; `bun` for the binary build.

<!-- MANUAL: notes below preserved on regeneration -->
