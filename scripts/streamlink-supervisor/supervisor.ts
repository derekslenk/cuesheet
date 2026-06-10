import { StreamPipeline, SpawnFn, ChildSource } from './streamPipeline';
import { PortAllocator } from './portAllocator';
import { RestartTracker } from './restartTracker';

export type StreamStatus = 'running' | 'escalated';

export interface StreamSpec {
  streamId: string;
  upstreamUrl: string;
  // Deterministic relay port (lib/relayPort). When set, it is used verbatim so
  // the webui's ffmpeg_source input and this relay target agree. Falls back to
  // the dynamic PortAllocator when absent (e.g. in unit tests).
  port?: number;
}

export interface StreamState {
  streamId: string;
  upstreamUrl: string;
  port: number;
  obsInputUrl: string;
  status: StreamStatus;
  restartCount: number;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastExitSource: ChildSource | null;
}

export interface SupervisorOptions {
  spawn: SpawnFn;
  ports: PortAllocator;
  tracker: RestartTracker;
  enqueue?: (fn: () => void) => void;
  now?: () => number;
  streamlinkPath?: string;
  ffmpegPath?: string;
  onStderr?: (streamId: string, source: ChildSource, chunk: string) => void;
}

interface SupervisedStream {
  spec: StreamSpec;
  state: StreamState;
  pipeline: StreamPipeline;
}

export class Supervisor {
  readonly spawn: SpawnFn;
  private readonly ports: PortAllocator;
  private readonly tracker: RestartTracker;
  private readonly enqueue: (fn: () => void) => void;
  private readonly now: () => number;
  private readonly streamlinkPath?: string;
  private readonly ffmpegPath?: string;
  private readonly onStderr?: SupervisorOptions['onStderr'];
  private readonly streams = new Map<string, SupervisedStream>();

  constructor(opts: SupervisorOptions) {
    this.spawn = opts.spawn;
    this.ports = opts.ports;
    this.tracker = opts.tracker;
    this.enqueue = opts.enqueue ?? (fn => setImmediate(fn));
    this.now = opts.now ?? (() => Date.now());
    this.streamlinkPath = opts.streamlinkPath;
    this.ffmpegPath = opts.ffmpegPath;
    this.onStderr = opts.onStderr;
  }

  start(spec: StreamSpec): StreamState {
    if (this.streams.has(spec.streamId)) {
      return this.streams.get(spec.streamId)!.state;
    }
    const port = spec.port ?? this.ports.allocate();
    const pipeline = this.makePipeline(spec, port);
    const state: StreamState = {
      streamId: spec.streamId,
      upstreamUrl: spec.upstreamUrl,
      port,
      obsInputUrl: pipeline.obsInputUrl,
      status: 'running',
      restartCount: 0,
      lastExitCode: null,
      lastExitSignal: null,
      lastExitSource: null,
    };
    this.streams.set(spec.streamId, { spec, state, pipeline });
    pipeline.start();
    return state;
  }

  stop(streamId: string): void {
    const entry = this.streams.get(streamId);
    if (!entry) return;
    entry.pipeline.stop();
    this.ports.release(entry.state.port);
    this.tracker.forget(streamId);
    this.streams.delete(streamId);
  }

  stopAll(): void {
    [...this.streams.keys()].forEach(id => this.stop(id));
  }

  // Operator-triggered restart of a single supervised stream. Reuses the
  // existing spec and port (no reallocation, no map deletion) and clears the
  // restart tracker so the fresh pipeline gets a full escalation budget. Works
  // on both 'running' and 'escalated' streams — this is the recovery action for
  // a stream the crash-loop guard has given up on. No-op (returns false) if the
  // stream isn't supervised (e.g. it's operator-stopped/disabled).
  restart(streamId: string): boolean {
    const entry = this.streams.get(streamId);
    if (!entry) return false;
    entry.pipeline.stop();
    this.tracker.forget(streamId);
    const pipeline = this.makePipeline(entry.spec, entry.state.port);
    entry.pipeline = pipeline;
    entry.state.restartCount += 1;
    entry.state.status = 'running';
    entry.state.lastExitCode = null;
    entry.state.lastExitSignal = null;
    entry.state.lastExitSource = null;
    pipeline.start();
    return true;
  }

  get(streamId: string): StreamState | undefined {
    return this.streams.get(streamId)?.state;
  }

  list(): StreamState[] {
    return [...this.streams.values()].map(s => s.state);
  }

  private makePipeline(spec: StreamSpec, port: number): StreamPipeline {
    return new StreamPipeline({
      streamId: spec.streamId,
      upstreamUrl: spec.upstreamUrl,
      port,
      spawn: this.spawn,
      streamlinkPath: this.streamlinkPath,
      ffmpegPath: this.ffmpegPath,
      onExit: info => this.onPipelineExit(spec.streamId, info),
      onStderr: this.onStderr
        ? (source, chunk) => this.onStderr!(spec.streamId, source, chunk)
        : undefined,
    });
  }

  private onPipelineExit(
    streamId: string,
    info: { source: ChildSource; code: number | null; signal: string | null }
  ): void {
    const entry = this.streams.get(streamId);
    if (!entry) return;

    entry.state.lastExitCode = info.code;
    entry.state.lastExitSignal = info.signal;
    entry.state.lastExitSource = info.source;

    this.tracker.record(streamId, this.now());
    if (this.tracker.shouldEscalate(streamId, this.now())) {
      entry.state.status = 'escalated';
      return;
    }

    this.enqueue(() => this.respawn(streamId));
  }

  private respawn(streamId: string): void {
    const entry = this.streams.get(streamId);
    if (!entry || entry.state.status === 'escalated') return;
    const pipeline = this.makePipeline(entry.spec, entry.state.port);
    entry.pipeline = pipeline;
    entry.state.restartCount += 1;
    entry.state.status = 'running';
    pipeline.start();
  }
}
