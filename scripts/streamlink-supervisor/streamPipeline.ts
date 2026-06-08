import { buildStreamlinkCmd, buildFfmpegRelayCmd } from './commands';

/**
 * Whether to fan the relay out to the preview port (in-browser preview).
 * Opt-in via PREVIEW_RELAY (on/1/true/yes); defaults OFF because the tee
 * was observed to periodically stall the OBS feed. See buildFfmpegRelayCmd.
 */
function previewTeeEnabled(): boolean {
  const v = (process.env.PREVIEW_RELAY ?? '').trim().toLowerCase();
  return v === 'on' || v === '1' || v === 'true' || v === 'yes';
}

/**
 * Gameday-toggleable streamlink quality. STREAMLINK_QUALITY accepts any
 * streamlink quality spec — a single value ("720p60", "1080p60", "best") or a
 * comma-separated fallback chain ("720p60,720p,best", tried left to right).
 * Returns undefined when unset so buildStreamlinkCmd keeps its "best" default.
 *
 * Why this matters: CPU is the binding constraint at scale (load test: the box
 * saturates ~37 concurrent 1080p60 real streams — streamlink pull + OBS work,
 * not RAM/VRAM). Dropping to 720p cuts both the pull and the decode cost
 * substantially, trading resolution for headroom. Set it in .env.local and
 * restart the supervisor to flip every pipeline.
 */
function streamlinkQuality(): string | undefined {
  const v = (process.env.STREAMLINK_QUALITY ?? '').trim();
  return v === '' ? undefined : v;
}

export type StreamPipelineStatus = 'pending' | 'running' | 'exited';
export type ChildSource = 'streamlink' | 'ffmpeg';

export interface ChildProcessLike {
  pid: number | null;
  stdout: { pipe(dest: unknown): unknown; on(event: 'error', cb: (err: Error) => void): void } | null;
  stdin: { end(): void; on(event: 'error', cb: (err: Error) => void): void } | null;
  stderr: { on(event: 'data', cb: (chunk: Buffer | string) => void): void } | null;
  kill(signal?: string): boolean;
  on(event: 'exit', listener: (code: number | null, signal: string | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
}

export type SpawnFn = (cmd: string, args: string[], opts?: object) => ChildProcessLike;

export interface ExitInfo {
  source: ChildSource;
  code: number | null;
  signal: string | null;
}

export interface StreamPipelineOptions {
  streamId: string;
  upstreamUrl: string;
  port: number;
  spawn: SpawnFn;
  streamlinkPath?: string;
  ffmpegPath?: string;
  quality?: string;
  onExit?: (info: ExitInfo) => void;
  onStderr?: (source: ChildSource, chunk: string) => void;
}

export class StreamPipeline {
  readonly streamId: string;
  readonly upstreamUrl: string;
  readonly port: number;
  readonly obsInputUrl: string;

  status: StreamPipelineStatus = 'pending';
  pids: { streamlink: number | null; ffmpeg: number | null } = { streamlink: null, ffmpeg: null };

  private readonly spawn: SpawnFn;
  private readonly streamlinkPath?: string;
  private readonly ffmpegPath?: string;
  private readonly quality?: string;
  private readonly onExit?: (info: ExitInfo) => void;
  private readonly onStderr?: (source: ChildSource, chunk: string) => void;

  private slChild: ChildProcessLike | null = null;
  private ffChild: ChildProcessLike | null = null;
  private exitReported = false;

  constructor(opts: StreamPipelineOptions) {
    this.streamId = opts.streamId;
    this.upstreamUrl = opts.upstreamUrl;
    this.port = opts.port;
    this.spawn = opts.spawn;
    this.streamlinkPath = opts.streamlinkPath;
    this.ffmpegPath = opts.ffmpegPath;
    this.quality = opts.quality;
    this.onExit = opts.onExit;
    this.onStderr = opts.onStderr;

    const { obsInputUrl } = buildFfmpegRelayCmd({ port: this.port, ffmpegPath: this.ffmpegPath });
    this.obsInputUrl = obsInputUrl;
  }

  start(): void {
    const sl = buildStreamlinkCmd({
      upstreamUrl: this.upstreamUrl,
      // Explicit per-pipeline quality wins; otherwise the env toggle; otherwise
      // buildStreamlinkCmd falls back to "best".
      quality: this.quality ?? streamlinkQuality(),
      streamlinkPath: this.streamlinkPath,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN,
    });
    const ff = buildFfmpegRelayCmd({
      port: this.port,
      ffmpegPath: this.ffmpegPath,
      previewTee: previewTeeEnabled(),
    });

    // windowsHide:true stops Windows from popping a console window per child —
    // otherwise every stream flashes two windows (streamlink + ffmpeg). stdio is
    // already piped/ignored so the consoles serve no purpose. No-op off Windows.
    this.slChild = this.spawn(sl.cmd, sl.args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    this.ffChild = this.spawn(ff.cmd, ff.args, { stdio: ['pipe', 'ignore', 'pipe'], windowsHide: true });

    if (this.slChild.stdout && this.ffChild.stdin) {
      // CRITICAL: swallow pipe errors. When ffmpeg exits, streamlink's stdout
      // keeps writing into ffmpeg's now-closed stdin → EPIPE on the destination
      // stream. Node/Bun's .pipe() does NOT handle destination errors, so an
      // unhandled EPIPE here throws and crashes the ENTIRE supervisor process —
      // taking down every other healthy pipeline, not just this one (observed
      // under load with ~19 concurrent streams). The real exit + respawn is
      // driven by attachExit below; these handlers just keep the broken pipe
      // from becoming an unhandled error.
      this.ffChild.stdin.on('error', () => { /* ffmpeg gone; attachExit respawns this pipeline */ });
      this.slChild.stdout.on('error', () => { /* upstream read error; handled via exit */ });
      this.slChild.stdout.pipe(this.ffChild.stdin);
    }

    this.pids = {
      streamlink: this.slChild.pid ?? null,
      ffmpeg: this.ffChild.pid ?? null,
    };
    this.status = 'running';

    this.attachExit(this.slChild, 'streamlink', this.ffChild);
    this.attachExit(this.ffChild, 'ffmpeg', this.slChild);
    // Also swallow spawn/process 'error' events (e.g. ENOENT, or an OS-level
    // error after spawn). Without a listener these too crash the whole process.
    this.attachError(this.slChild, 'streamlink');
    this.attachError(this.ffChild, 'ffmpeg');
    this.attachStderr(this.slChild, 'streamlink');
    this.attachStderr(this.ffChild, 'ffmpeg');
  }

  stop(signal: string = 'SIGTERM'): void {
    this.slChild?.kill(signal);
    this.ffChild?.kill(signal);
    this.status = 'exited';
  }

  private attachExit(child: ChildProcessLike, source: ChildSource, sibling: ChildProcessLike): void {
    child.on('exit', (code, signal) => {
      this.status = 'exited';
      try { sibling.kill('SIGTERM'); } catch { /* sibling already gone */ }
      if (this.exitReported) return;
      this.exitReported = true;
      this.onExit?.({ source, code, signal });
    });
  }

  private attachError(child: ChildProcessLike, source: ChildSource): void {
    // A child 'error' (failed spawn, OS error) with no listener crashes the
    // process. Route it through the same exit path so the pipeline respawns
    // instead of taking the whole supervisor down.
    child.on('error', (err: Error) => {
      try { this.onStderr?.(source, `process error: ${err.message}`); } catch { /* logging best-effort */ }
      this.status = 'exited';
      if (this.exitReported) return;
      this.exitReported = true;
      this.onExit?.({ source, code: null, signal: null });
    });
  }

  private attachStderr(child: ChildProcessLike, source: ChildSource): void {
    if (!child.stderr || !this.onStderr) return;
    child.stderr.on('data', chunk => {
      this.onStderr!(source, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
  }
}
