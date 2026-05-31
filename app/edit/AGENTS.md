<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/edit

## Purpose
Route segment for editing an existing stream. This directory has no `page.tsx` of its own — `/edit` is not a navigable route. All behavior lives in the dynamic child segment `[id]`, which renders the per-stream edit form at `/edit/:id`.

## Subdirectories
| Subdirectory | Description |
|---|---|
| `[id]/` | Dynamic route `/edit/:id` — stream edit form (see `[id]/AGENTS.md`) |

## For AI Agents

### Working In This Directory
There is nothing to edit here directly. To change edit-page behavior, work in `[id]/page.tsx`. Do not add a `page.tsx` at this level unless you intend to create a navigable `/edit` route.

### Common Patterns
Next.js App Router dynamic segments: a bracketed folder name (`[id]`) maps the URL path parameter to `useParams()`.

## Dependencies

### Internal
- `app/edit/[id]/page.tsx` — the actual edit page.

<!-- MANUAL: notes below preserved on regeneration -->
