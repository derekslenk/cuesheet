<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-06-08 | Updated: 2026-06-08 -->

# preview/[...slug]

## Purpose
HLS preview endpoint: `GET /api/preview/<streamId>/<file>` serves a live
HLS playlist + segments for an individual stream so the webui can show an
in-browser preview. On first hit it spawns an ffmpeg packager (via
`lib/previewManager.ensurePreview`) that joins the stream's UDP relay feed and
emits `index.m3u8` + `seg_*.ts`; subsequent hits keep it alive. Idle packagers
are reaped by `previewManager`.

## Key Files
| File | Description |
| --- | --- |
| `route.ts` | Catch-all `GET`. Validates `id`/`file` (only `index.m3u8` or `seg_\d{1,6}.ts` are servable), `ensurePreview(id)` + `touchPreview(id)`, then reads the file from `previewDir(id)` with a short poll while ffmpeg warms up. |

## For AI Agents
### Working In This Directory
- `export const runtime = 'nodejs'` and `dynamic = 'force-dynamic'` are
  required — the handler spawns ffmpeg and reads temp files (never edge), and
  the playlist changes every second (never cache).
- Keep `FILE_RE` strict: it's the only guard against path traversal / serving
  arbitrary files out of `previewDir`.
- Status contract for `hls.js`: 404 (bad id/file), 429 (`PreviewCapacityError`
  — concurrency ceiling, prevents a wall of previews self-DoSing the host),
  503 (not ready yet → client retries). Preserve these.
- Poll deadlines (6s playlist / 2s segment) absorb ffmpeg join latency — tune in
  `previewManager`, not by loosening the runtime/cache directives here.

### Testing Requirements
- `npm test` from repo root with `lib/previewManager` mocked.

## Dependencies
### Internal
- `lib/previewManager` (`ensurePreview`, `touchPreview`, `previewDir`,
  `PreviewCapacityError`).
### External
- `next`, Node `fs/promises`/`path`; spawns `ffmpeg` (via `previewManager`).

<!-- MANUAL: notes below preserved on regeneration -->
