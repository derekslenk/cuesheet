<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-05-31 | Updated: 2026-05-31 -->

# app/fonts

## Purpose
Holds the self-hosted **Geist** variable font binaries used by CueSheet. These `.woff` files are loaded locally (rather than from a CDN) so the app's typography works offline and without external requests — appropriate for a tool that runs on a production OBS host. They are typically wired up in the root layout via `next/font/local`.

## Key Files
| File | Description |
|---|---|
| `GeistVF.woff` | Geist variable font (sans-serif), full weight axis in one file. |
| `GeistMonoVF.woff` | Geist Mono variable font (monospace), full weight axis in one file. |

## For AI Agents

### Working In This Directory
- Binary assets only — do not attempt to edit them as text.
- If you replace or rename a file, update its `next/font/local` registration (search the repo for `GeistVF` / `GeistMonoVF`, usually in `app/layout.tsx`).
- Prefer keeping these as variable fonts; adding per-weight static files reintroduces multiple network/file loads.

### Common Patterns
`next/font/local` with `src` pointing at these files and a `variable` CSS custom property consumed by Tailwind/global CSS.

## Dependencies

### Internal
- Referenced by the root layout (`app/layout.tsx`).

### External
- `next/font/local`

<!-- MANUAL: notes below preserved on regeneration -->
