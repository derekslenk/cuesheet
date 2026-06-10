import { Server } from 'http';
import { Supervisor, StreamSpec } from './supervisor';
import { PortAllocator } from './portAllocator';
import { RestartTracker } from './restartTracker';
import { startHealthServer, DashboardStream } from './healthServer';
import { FileLogger } from './fileLogger';
import { loadStreamSpecs, loadStreamSpec, loadStreamRows, isValidRow, assertSafeTableName, MinimalDb } from './streamSpecsLoader';
import { relayPort } from '../../lib/relayPort';
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
  onStart: (streamId: string) => Promise<boolean>;
  onStop: (streamId: string) => Promise<boolean>;
  listAll: () => Promise<DashboardStream[]>;
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

  // Durable Start: enable the row, then start the (single) stream in place.
  // start() guards double-start, so re-clicking is safe. Returns false for an
  // unknown streamId (=> 404). DB write first; the flag is authoritative.
  const onStart = async (streamId: string): Promise<boolean> => {
    assertSafeTableName(opts.tableName);
    const spec = await loadStreamSpec({ db: opts.db, tableName: opts.tableName }, streamId);
    if (!spec) return false;
    await opts.db.run(
      `UPDATE ${opts.tableName} SET disabled = 0 WHERE obs_source_name = ?`,
      streamId
    );
    supervisor.start(spec);
    return true;
  };

  // Durable Stop: disable the row, then stop the pipeline (no-op if not running).
  const onStop = async (streamId: string): Promise<boolean> => {
    assertSafeTableName(opts.tableName);
    const spec = await loadStreamSpec({ db: opts.db, tableName: opts.tableName }, streamId);
    if (!spec) return false;
    await opts.db.run(
      `UPDATE ${opts.tableName} SET disabled = 1 WHERE obs_source_name = ?`,
      streamId
    );
    supervisor.stop(streamId);
    return true;
  };

  // DB-backed list of ALL streams merged with live supervised state. A stopped
  // row isn't in supervisor.list(), so its eventual port is derived via
  // relayPort(id) and its status is 'stopped'.
  const listAll = async (): Promise<DashboardStream[]> => {
    const rows = await loadStreamRows({ db: opts.db, tableName: opts.tableName });
    const live = new Map(supervisor.list().map(s => [s.streamId, s]));
    return rows.filter(isValidRow).map(row => {
      const s = live.get(row.obs_source_name!);
      return {
        streamId: row.obs_source_name!,
        url: row.url!,
        disabled: row.disabled ? 1 : 0,
        status: s ? s.status : 'stopped',
        port: s ? s.port : relayPort(row.id!),
        restartCount: s ? s.restartCount : 0,
        lastExitCode: s ? s.lastExitCode : null,
        lastExitSource: s ? s.lastExitSource : null,
      };
    });
  };

  const server = startHealthServer({
    provider: supervisor,
    port: opts.healthPort,
    hostname: opts.healthHost,
    dashboardHtml: opts.dashboardHtml,
    onReload: reload,
    onRestart: (streamId: string) => supervisor.restart(streamId),
    onStart,
    onStop,
    listAll,
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

  return { supervisor, server, reload, shutdown, onStart, onStop, listAll };
}
