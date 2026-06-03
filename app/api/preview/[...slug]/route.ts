import { NextRequest } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { ensurePreview, touchPreview, previewDir } from '@/lib/previewManager';

// Spawns ffmpeg + reads temp files — must run on the Node runtime, never edge,
// and must never be statically cached (the playlist changes every second).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Only the playlist and numbered segments this packager produces are servable.
const FILE_RE = /^(index\.m3u8|seg_\d{1,6}\.ts)$/;

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ slug: string[] }> }
) {
  const { slug } = await ctx.params;
  const [idStr, file] = slug ?? [];
  const id = Number(idStr);

  if (!Number.isInteger(id) || id < 1 || !file || !FILE_RE.test(file)) {
    return new Response('not found', { status: 404 });
  }

  // First touch starts the packager; subsequent touches keep it alive.
  ensurePreview(id);
  touchPreview(id);

  const path = join(previewDir(id), file);
  const isPlaylist = file.endsWith('.m3u8');

  // ffmpeg needs a moment to join the UDP feed and emit the first playlist.
  // Poll briefly so the player's initial request doesn't 404 the stream away.
  const deadline = Date.now() + (isPlaylist ? 6000 : 2000);
  let data: Buffer | null = null;
  for (;;) {
    try {
      data = await readFile(path);
      break;
    } catch {
      if (Date.now() >= deadline) break;
      await new Promise(r => setTimeout(r, 150));
    }
  }

  if (!data) {
    // Not ready yet (or relay isn't sending). 503 → hls.js retries.
    return new Response('preview not ready', { status: 503 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      'Content-Type': isPlaylist ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
      'Cache-Control': 'no-store',
    },
  });
}
