# Stream Label Overlay — Design Reference (v1)

The HTML-driven stream label is served at `/overlay/stream/[id]` and consumed by a
per-stream OBS browser source. This document is the **visual baseline** for the
label: future changes should be screenshot-diffed against this spec, and a pixel
baseline captured during Phase 4 QA (once real-handle visibility is approved for
the public repo — verification renders are kept locally under `.omc/`, not
committed).

Source: `app/(overlay)/overlay/stream/[id]/` + `app/(overlay)/overlay.css`.
Data contract: `lib/overlayData.ts` ← `GET /api/overlay/[id]`.

## Anatomy

```
 ┌─┬───────────────────────────────┐   ← plate: opaque brand fill (--lbl-bg) +
 │▌│  TEAM NAME            [ROLE]   │     subtle top sheen, 4px radius, depth
 │▌│  Streamer Name        ● 1,234  │     shadow, lit top edge
 └─┴───────────────────────────────┘
  ↑ accent bar (--lbl-accent), 8px, full-height, soft glow, wipe-in
```

- **Anchor:** top-left, `top:28px left:48px` — matches where the OBS-native
  labels sit inside each nested `*_stream` scene, so the label rides + scales
  with the switcher cell.
- **Team eyebrow:** uppercase, `letter-spacing:0.18em`, weight 600, 34px, colored
  with the brand **accent** (`--lbl-accent`).
- **Streamer name:** the primary identity — weight 800, 78px, white
  (`--lbl-text`), `letter-spacing:-0.01em`, drop shadow for legibility.
- **Logo slot** (`--lbl logo`, optional): 72×72 left of the text, shown only when
  the team has `logo_path` (Phase 1 / US-003).
- **Role chip + live viewers** (optional, Phase 3 / US-006): pill in accent color
  + a pulsing live dot with the viewer count. Hidden until populated; `score` is
  never shown without a real source.

## Palette (per-team, event-default fallback)

Driven by CSS custom properties set inline from the contract; unset team colors
fall back to the 2026 event defaults (`lib/overlayData.ts` `EVENT_DEFAULT_COLORS`,
mirroring `lib/labelLayout.js`):

| Token         | Default   | Meaning                |
| ------------- | --------- | ---------------------- |
| `--lbl-bg`    | `#472f5a` | plate fill (purple)    |
| `--lbl-accent`| `#e0d9f1` | accent bar + eyebrow   |
| `--lbl-text`  | `#ffffff` | streamer name          |

## Typography

Bundled webfont **Geist** (variable, `public/fonts/GeistVF.woff`, `@font-face`),
fallback `Bahnschrift` then system sans — deterministic, not dependent on a
host-installed font.

## Motion

Staggered entrance on mount (which is when data arrives): plate slides+fades in
from the left, accent bar wipes vertically, eyebrow/name/meta rise. Replay on
re-show is driven by the page reload (under `shutdown:true`) or an SSE "shown"
signal (under `shutdown:false`) — **never** by `restart_when_active` (documented
flicker). All motion is disabled under `prefers-reduced-motion`.

## Failure behavior (fail visibly, never silently)

An unknown id (`GET /api/overlay/[id]` → 404) renders a glaring magenta
`NO DATA · id=<n>` box, **not** a transparent gap — so a stale baked URL (e.g.
after a re-import churns the PK) is caught in QA, not discovered on air. While the
fetch is in flight the page is fully transparent (no empty-plate flash).

## Legibility

Verified legible at 25% scale (4-Screen quadrant) and full scale.
