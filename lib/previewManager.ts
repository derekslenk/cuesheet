/**
 * On-demand HLS preview packager (server-only).
 *
 * The streamlink supervisor tees every relay to a deterministic preview UDP
 * port (see lib/relayPort `previewPort`). This module lazily spawns one ffmpeg
 * per previewed stream that joins that UDP feed and remuxes it — `-c copy`, no
 * re-encode, since Twitch is already H.264/AAC — into a short rolling HLS
 * playlist the browser can play via hls.js.
 *
 * Packagers are reference-light: started on first request, kept alive by
 * access "touches", and reaped after PREVIEW_IDLE_MS of no access. Nothing
 * runs unless someone is actually watching.
 *
 * NOTE: node runtime only (spawns ffmpeg, writes temp files). API routes that
 * import this must set `export const runtime = 'nodejs'`.
 */
import { spawn, ChildProcess } from 'child_process';
import { mkdirSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { previewUdpUrl } from './relayPort';

const ROOT = join(tmpdir(), 'cuesheet-preview');
const IDLE_MS = parseInt(process.env.PREVIEW_IDLE_MS || '20000', 10);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

interface Session {
  proc: ChildProcess;
  dir: string;
  lastAccess: number;
  lastError?: string;
}

const sessions = new Map<number, Session>();
let reaper: NodeJS.Timeout | null = null;

export function previewDir(streamId: number): string {
  return join(ROOT, String(streamId));
}

function startReaper(): void {
  if (reaper) return;
  reaper = setInterval(() => {
    const now = Date.now();
    for (const [id, s] of sessions) {
      if (now - s.lastAccess > IDLE_MS) stopPreview(id);
    }
    if (sessions.size === 0 && reaper) {
      clearInterval(reaper);
      reaper = null;
    }
  }, 5000);
  // Don't keep the event loop (or the dev server) alive just for the reaper.
  reaper.unref?.();
}

/** Spawn the packager for this stream if it isn't already running. */
export function ensurePreview(streamId: number): string {
  const existing = sessions.get(streamId);
  if (existing && existing.proc.exitCode === null && existing.proc.signalCode === null) {
    existing.lastAccess = Date.now();
    return existing.dir;
  }

  const dir = previewDir(streamId);
  mkdirSync(dir, { recursive: true });

  // overrun_nonfatal + a fifo keep ffmpeg resilient to UDP bursts; timeout
  // makes it exit (rather than hang) if the relay isn't sending — the session
  // then clears itself and the preview simply reports "unavailable".
  const input =
    `${previewUdpUrl(streamId)}?fifo_size=1000000&overrun_nonfatal=1&timeout=8000000`;

  const args = [
    '-hide_banner',
    '-loglevel', 'error',
    '-fflags', 'nobuffer',
    '-i', input,
    '-c', 'copy',
    '-f', 'hls',
    '-hls_time', '1',
    '-hls_list_size', '4',
    '-hls_flags', 'delete_segments+omit_endlist+independent_segments',
    '-hls_segment_type', 'mpegts',
    '-hls_segment_filename', join(dir, 'seg_%05d.ts'),
    join(dir, 'index.m3u8'),
  ];

  const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const session: Session = { proc, dir, lastAccess: Date.now() };

  proc.stderr?.on('data', (chunk: Buffer) => {
    session.lastError = chunk.toString('utf8').slice(0, 500);
  });
  proc.on('exit', () => {
    // Only forget if this exact process is still the registered one.
    if (sessions.get(streamId)?.proc === proc) sessions.delete(streamId);
  });
  proc.on('error', () => {
    if (sessions.get(streamId)?.proc === proc) sessions.delete(streamId);
  });

  sessions.set(streamId, session);
  startReaper();
  return dir;
}

export function touchPreview(streamId: number): void {
  const s = sessions.get(streamId);
  if (s) s.lastAccess = Date.now();
}

export function stopPreview(streamId: number): void {
  const s = sessions.get(streamId);
  if (!s) return;
  sessions.delete(streamId);
  try { s.proc.kill('SIGTERM'); } catch { /* already gone */ }
  try { rmSync(s.dir, { recursive: true, force: true }); } catch { /* best effort */ }
}

export function previewIsRunning(streamId: number): boolean {
  const s = sessions.get(streamId);
  return !!s && s.proc.exitCode === null && s.proc.signalCode === null;
}
