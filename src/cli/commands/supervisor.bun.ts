/**
 * `cuesheet sup` — run the streamlink supervisor in-process.
 *
 * BUN-ONLY: imports `bun:sqlite` and embeds dashboard.html via an import
 * attribute. This file is excluded from the tsc gate (see tsconfig "exclude")
 * and reached from main.ts through a LITERAL dynamic import so
 * `bun build --compile` bundles it into the binary.
 *
 * Wiring mirrors scripts/streamlink-supervisor/index.bun.ts exactly — same
 * read-only bun:sqlite handle, same MinimalDb adapter, same startRuntime call,
 * same SIGINT/SIGTERM shutdown. Config values are pulled through lib/env.ts
 * resolveAll() so CLI flags / .env.local / OS defaults all take effect.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { Database as BunDatabase } from 'bun:sqlite';
// Embedded at compile time — Bun inlines the file contents as a string and
// includes it in the binary. Identical to the index.bun.ts embed.
import dashboardHtml from '../../../scripts/streamlink-supervisor/dashboard.html' with { type: 'text' };
import { TABLE_NAMES } from '../../../lib/constants.js';
import { startRuntime } from '../../../scripts/streamlink-supervisor/runtime.js';
import type { MinimalDb } from '../../../scripts/streamlink-supervisor/streamSpecsLoader.js';
import type { CommandContext } from '../lib/types.js';
import { resolveAll } from '../lib/env.js';
import { logDir, ensureDir } from '../lib/paths.js';

/** Parse an integer env var, falling back to `fallback` on missing/invalid. */
function envInt(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`env ${name}=${raw} is not an integer`);
  }
  return n;
}

/**
 * Read-only bun:sqlite handle adapted to the MinimalDb interface.
 * Mirrors openDatabase() in index.bun.ts exactly: the webui owns the schema
 * and always runs first; opening read-only makes that contract explicit.
 */
function openDatabase(fileDirectory: string): MinimalDb {
  const dbPath = path.join(path.resolve(fileDirectory), 'sources.db');
  const sqlite = new BunDatabase(dbPath, { readonly: true });
  return {
    async all<T = unknown>(sql: string): Promise<T[]> {
      return sqlite.query(sql).all() as T[];
    },
  };
}

export async function run(_argv: string[], ctx: CommandContext): Promise<void> {
  const cfg = resolveAll({}, ctx.env, ctx.cwd);

  const fileDirectory = cfg.FILE_DIRECTORY.value ?? './files';
  const healthPort   = envInt(ctx.env, 'SUPERVISOR_HEALTH_PORT', parseInt(cfg.SUPERVISOR_HEALTH_PORT.value ?? '8080', 10));
  const basePort     = envInt(ctx.env, 'SUPERVISOR_BASE_PORT',   parseInt(cfg.SUPERVISOR_BASE_PORT.value   ?? '9001', 10));
  const maxPorts     = envInt(ctx.env, 'SUPERVISOR_MAX_PORTS',   parseInt(cfg.SUPERVISOR_MAX_PORTS.value   ?? '8',    10));
  const healthHost   = ctx.env.SUPERVISOR_HEALTH_HOST ?? cfg.SUPERVISOR_HEALTH_HOST.value ?? '127.0.0.1';

  // Supervisor streams get their own sub-directory under the CLI log dir.
  const supLogDir = path.join(logDir(ctx.env), 'streamlink-supervisor');
  ensureDir(supLogDir);

  const db = openDatabase(fileDirectory);

  const runtime = await startRuntime({
    db,
    tableName: ctx.env.STREAMS_TABLE ?? TABLE_NAMES.STREAMS,
    spawn: spawn as never,
    ports: { basePort, max: maxPorts },
    healthPort,
    healthHost,
    logDir: supLogDir,
    logMaxBytes: envInt(ctx.env, 'SUPERVISOR_LOG_MAX_BYTES', 10 * 1024 * 1024),
    logRetain:   envInt(ctx.env, 'SUPERVISOR_LOG_RETAIN', 5),
    streamlinkPath: cfg.STREAMLINK_PATH.value,
    ffmpegPath:     cfg.FFMPEG_PATH.value,
    dashboardHtml,
  });

  const streams = runtime.supervisor.list();
  const baseUrl = `http://${healthHost}:${healthPort}`;
  ctx.stdout.write(
    `[supervisor] started — ${streams.length} stream(s) supervised, ` +
    `dashboard ${baseUrl}/ — JSON ${baseUrl}/health\n`
  );
  streams.forEach((s: { streamId: string; obsInputUrl: string }) => {
    ctx.stdout.write(`[supervisor]   ${s.streamId} → ${s.obsInputUrl}\n`);
  });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return; // a second Ctrl-C must not re-enter shutdown
    shuttingDown = true;
    ctx.stdout.write(`[supervisor] received ${signal}, shutting down\n`);
    await runtime.shutdown();
    process.exit(0);
  };
  process.on('SIGINT',  () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });

  // Run until signalled — the health server keeps the event loop alive.
  await new Promise<void>(() => { /* resolved only by shutdown() above */ });
}
