import { Server } from 'http';
import { Supervisor, StreamSpec } from './supervisor';
import { PortAllocator } from './portAllocator';
import { RestartTracker } from './restartTracker';
import { startHealthServer } from './healthServer';
import { FileLogger } from './fileLogger';
import { loadStreamSpecs, MinimalDb } from './streamSpecsLoader';
import { SpawnFn } from './streamPipeline';

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
}

export interface SupervisorRuntime {
  supervisor: Supervisor;
  server: Server;
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
      loggerFor(streamId).write(`[${source}] ${chunk}`);
    },
  });

  const specs = await loadStreamSpecs({ db: opts.db, tableName: opts.tableName });
  specs.forEach((spec: StreamSpec) => supervisor.start(spec));

  const server = startHealthServer({
    provider: supervisor,
    port: opts.healthPort,
    hostname: opts.healthHost,
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

  return { supervisor, server, shutdown };
}
