# Whole-repo review & 6-month roadmap — June 2026

A comprehensive, multi-dimensional code review of `cuesheet` (whole repo, ~27k LOC) conducted **2026-06-14 → 2026-06-15** on branch `feat/html-stream-labels`, followed by a re-sequenced engineering roadmap.

## Reading order

| File | What it is |
|------|-----------|
| [00-scope.md](00-scope.md) | Scope, stack/tooling inventory, the 5 review phases |
| [01-quality-architecture.md](01-quality-architecture.md) | Phase 1 — Code Quality & Architecture |
| [02-security-performance.md](02-security-performance.md) | Phase 2 — Security & Performance |
| [03-testing-documentation.md](03-testing-documentation.md) | Phase 3 — Testing & Documentation |
| [04-best-practices.md](04-best-practices.md) | Phase 4 — Framework/Language Standards & CI/CD |
| **[05-final-report.md](05-final-report.md)** | **Consolidated, de-duplicated findings (P0–P3) + action plan — start here** |
| **[06-roadmap.md](06-roadmap.md)** | **Re-sequenced 6-month engineering roadmap (no event-deadline lens)** |
| `_phase*-raw.md` | Raw per-agent outputs (evidence trail with exact file:line citations) |

## Method

Eight specialized agents (two per phase) reviewed the live repo, each reading and citing source. Findings were cross-phase de-duplicated and severity-calibrated to the single-operator LAN threat model; the test suite was executed (609 tests pass) and `npm audit` run. The roadmap (`06`) was produced by six agents deep-scoping the foundational tracks against the real code, a dependency/sequencing pass, and an adversarial critique (verdict: minor-revisions — corrections applied).

## Key takeaways

- **No security Critical/High and no data-loss/correctness defects.** The newest `feat/html-stream-labels` code is the highest-quality in the repo. A prior "Critical SQL injection" claim was re-verified as a **false positive**.
- The real debt is concentrated in the **older core** — the 1,404-line untyped `obsClient.js`, the inconsistent API response envelopes across 24 routes, and ~0% test coverage on the old security-critical code (`middleware.ts`, `lib/security.ts`).
- With **no upcoming event** (next event ~6 months out), `06-roadmap.md` re-sequences everything foundational-first: the typed `obsClient` extraction and `apiHelpers` convergence as keystones, quick wins up front, and the big refactor as a sustained, characterization-test-first spine.

> Note: cross-references inside these files that cite `.full-review/NN-*.md` refer to the sibling file of the same name in this folder (the review was generated in the `.full-review/` scratch directory before being promoted here).
