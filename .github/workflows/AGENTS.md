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
| `build.yml` | "Lint, Test and Build" — runs on push/PR to `main` across Node 20 & 22 (`npm run lint`, `test`, `build`). |
| `cuesheet-binary.yml` | Builds the unified `cuesheet` binary per OS and runs the read-only smoke checks (`--help`, `status --json`, `doctor`) — AC15. |
| `release.yml` | Release pipeline (tag/version → artifacts). |
| `claude.yml` | Claude Code assistant workflow (issue/PR automation). |
| `claude-code-review.yml` | Automated Claude Code review on PRs. |

## For AI Agents
### Working In This Directory
- Keep `build.yml` and `cuesheet-binary.yml` in sync with the npm scripts they
  invoke (`lint`/`test`/`build`, `binary:build:*`, `binary:smoke`) — a renamed
  script must be updated here too.
- Binary smoke checks must stay **read-only** (`--help`, `status --json`,
  `doctor`); never have CI spawn the supervisor or kill processes.
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
