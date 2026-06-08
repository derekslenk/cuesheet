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

export type StreamPipelineStatus = 'pending' | 'running' | 'exited';
export type ChildSource = 'streamlink' | 'ffmpeg';

export interface ChildProcessLike {
  pid: number | null;
  stdout: { pipe(dest: unknown): unknown } | null;
  stdin: { end(): void } | null;
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
      quality: this.quality,
      streamlinkPath: this.streamlinkPath,
      oauthToken: process.env.TWITCH_OAUTH_TOKEN,
    });
    const ff = buildFfmpegRelayCmd({
      port: this.port,
      ffmpegPath: this.ffmpegPath,
      previewTee: previewTeeEnabled(),
    });

    this.slChild = this.spawn(sl.cmd, sl.args, { stdio: ['ignore', 'pipe', 'pipe'] });
    this.ffChild = this.spawn(ff.cmd, ff.args, { stdio: ['pipe', 'ignore', 'pipe'] });

    if (this.slChild.stdout && this.ffChild.stdin) {
      this.slChild.stdout.pipe(this.ffChild.stdin);
    }

    this.pids = {
      streamlink: this.slChild.pid ?? null,
      ffmpeg: this.ffChild.pid ?? null,
    };
    this.status = 'running';

    this.attachExit(this.slChild, 'streamlink', this.ffChild);
    this.attachExit(this.ffChild, 'ffmpeg', this.slChild);
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

  private attachStderr(child: ChildProcessLike, source: ChildSource): void {
    if (!child.stderr || !this.onStderr) return;
    child.stderr.on('data', chunk => {
      this.onStderr!(source, typeof chunk === 'string' ? chunk : chunk.toString('utf8'));
    });
  }
}
