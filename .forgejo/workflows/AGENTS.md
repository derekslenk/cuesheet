<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# .forgejo/workflows

## Purpose
Forgejo Actions CI for the self-hosted mirror. Mirrors the GitHub
`build.yml` lint/build on push & PR to `main`, but targets a **self-hosted**
runner (Node pre-installed).

## Key Files
| File | Description |
| --- | --- |
| `build.yml` | "Lint and Build" — push/PR to `main`, `runs-on: self-hosted`; checkout → lint → build. |

## For AI Agents
### Working In This Directory
- Keep conceptually aligned with `.github/workflows/build.yml`, but note the
  runner differences: `self-hosted` (no `setup-node` — Node is pre-installed),
  so don't copy GitHub-only setup steps verbatim.
- Forgejo Actions syntax is GitHub-compatible; reference actions that the
  self-hosted runner can resolve.

### Testing Requirements
- Validated by the self-hosted CI run; no local Jest coverage.

## Dependencies
### Internal
- `package.json` scripts (`lint`, `build`).
### External
- Self-hosted Forgejo Actions runner (Node pre-installed).

<!-- MANUAL: notes below preserved on regeneration -->
