import { Server } from 'http';
import { Supervisor, StreamSpec } from './supervisor';
import { PortAllocator } from './portAllocator';
import { RestartTracker } from './restartTracker';
import { startHealthServer } from './healthServer';
import { FileLogger } from './fileLogger';
import { loadStreamSpecs, MinimalDb } from './streamSpecsLoader';
import { SpawnFn } from './streamPipeline';
import { redactSecrets } from './redact';

export interface StartRuntimeOptions {
  db: MinimalDb;
  tableName: string;
  spawn: SpawnFn;
  ports: { basePort: number; max: number };
  healthPort: number;
  healthHost?: string;
  logDir: string;
  logMaxBytes?: number;
  logRetain?: number;
  streamlinkPath?: string;
  ffmpegPath?: string;
  dashboardHtml?: string;
}

export interface SupervisorRuntime {
  supervisor: Supervisor;
  server: Server;
  reload: () => Promise<{ added: string[]; removed: string[]; total: number }>;
  shutdown: () => Promise<void>;
}

export async function startRuntime(opts: StartRuntimeOptions): Promise<SupervisorRuntime> {
  const loggers = new Map<string, FileLogger>();
  const loggerFor = (streamId: string): FileLogger => {
    let logger = loggers.get(streamId);
    if (!logger) {
      logger = new FileLogger({
        dir: opts.logDir,
        name: streamId,
        maxBytes: opts.logMaxBytes ?? 10 * 1024 * 1024,
        retain: opts.logRetain ?? 5,
      });
      loggers.set(streamId, logger);
    }
    return logger;
  };

  const supervisor = new Supervisor({
    spawn: opts.spawn,
    ports: new PortAllocator(opts.ports),
    tracker: new RestartTracker(),
    streamlinkPath: opts.streamlinkPath,
    ffmpegPath: opts.ffmpegPath,
    onStderr: (streamId, source, chunk) => {
      // Redact the Twitch OAuth token before it lands in on-disk logs —
      // streamlink can echo the Authorization header into stderr.
      loggerFor(streamId).write(`[${source}] ${redactSecrets(chunk)}`);
    },
  });

  const specs = await loadStreamSpecs({ db: opts.db, tableName: opts.tableName });
  specs.forEach((spec: StreamSpec) => supervisor.start(spec));

  // Re-read the DB and reconcile: start streams added since launch, stop ones
  // removed. Lets the webui push new streams to a feed without a restart.
  const reload = async (): Promise<{ added: string[]; removed: string[]; total: number }> => {
    const desired = await loadStreamSpecs({ db: opts.db, tableName: opts.tableName });
    const desiredById = new Map(desired.map(s => [s.streamId, s]));
    const current = new Set(supervisor.list().map(s => s.streamId));
    const added: string[] = [];
    const removed: string[] = [];
    for (const [streamId, spec] of desiredById) {
      if (!current.has(streamId)) { supervisor.start(spec); added.push(streamId); }
    }
    for (const streamId of current) {
      if (!desiredById.has(streamId)) { supervisor.stop(streamId); removed.push(streamId); }
    }
    return { added, removed, total: desiredById.size };
  };

  const server = startHealthServer({
    provider: supervisor,
    port: opts.healthPort,
    hostname: opts.healthHost,
    dashboardHtml: opts.dashboardHtml,
    onReload: reload,
  });

  let shutdownDone = false;
  const shutdown = async (): Promise<void> => {
    if (shutdownDone) return;
    shutdownDone = true;
    supervisor.stopAll();
    loggers.forEach(l => l.close());
    loggers.clear();
    await new Promise<void>(resolve => server.close(() => resolve()));
  };

  return { supervisor, server, reload, shutdown };
}
