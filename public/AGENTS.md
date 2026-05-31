<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# public

## Purpose

Static assets served from the web root by Next.js. Files here are reachable at `/<filename>` (e.g. `/next.svg`). Currently this is only the default Next.js scaffold SVG icons; CueSheet does not yet ship custom public assets.

## Key Files

| File | Description |
|------|-------------|
| `file.svg` | Generic file/document glyph (Next.js scaffold default). |
| `globe.svg` | Globe glyph (Next.js scaffold default). |
| `next.svg` | Next.js wordmark logo (scaffold default). |
| `vercel.svg` | Vercel logo (scaffold default). |
| `window.svg` | Window glyph (Next.js scaffold default). |

## For AI Agents

### Working In This Directory

- Assets are served at the site root, not under `/public` — reference them as `/next.svg`, not `/public/next.svg`.
- All current files are unmodified Next.js scaffolding; safe to replace or remove if the UI stops referencing them.

### Testing Requirements

- None. Static files require no build step beyond Next.js asset serving.

## Dependencies

### Internal

- Referenced (if at all) from components under `app/` and `components/` via root-relative paths.

### External

- Served by the Next.js static asset pipeline.

<!-- MANUAL: notes below preserved on regeneration -->
