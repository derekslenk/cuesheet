/**
 * Streamlink supervisor entry point — Bun single-executable variant.
 *
 * Functionally identical to index.ts, but built for `bun build --compile` so
 * the supervisor ships as ONE self-contained .exe (no Node, no tsx, no
 * node_modules) that can be registered as a Windows service.
 *
 * Two deliberate differences from index.ts make a clean single binary possible:
 *
 *   1. DB access uses Bun's built-in `bun:sqlite` instead of the `sqlite` /
 *      `sqlite3` npm stack. sqlite3 is a native C++ addon (.node) that does not
 *      embed cleanly into a compiled binary; bun:sqlite is part of the runtime,
 *      so there is nothing native to bundle. The supervisor now owns the
 *      durable `disabled` write, so the handle is read-WRITE (WAL +
 *      busy_timeout) via the shared `openBunDatabase` helper, which lets it
 *      share sources.db with the webui's sqlite3 handle. lib/database — which
 *      the webui still uses — is left untouched.
 *
 *   2. dashboard.html is embedded at build time via an import attribute instead
 *      of being read from disk relative to import.meta.url (which points inside
 *      the packed binary at runtime, where the file does not exist on disk).
 *
 * Build:   npm run supervisor:build         (host-native binary)
 *          npm run supervisor:build:win     (Windows x64 cross-compile)
 *
 * Runtime deps that stay external (must be on PATH, exactly as for the tsx
 * version): streamlink and ffmpeg. Those are spawned as child processes, not
 * bundled.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';
import { openBunDatabase } from './bunDatabase';
// Embedded at compile time — Bun inlines the file's contents as a string and
// includes it in the binary. Bun resolves this import attribute at build; the
// webui's tsc gate skips this file (see tsconfig "exclude").
import dashboardHtml from './dashboard.html' with { type: 'text' };
import { TABLE_NAMES } from '../../lib/constants';
import { startRuntime } from './runtime';

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) {
    throw new Error(`env ${name}=${raw} is not an integer`);
  }
  return n;
}

async function main(): Promise<void> {
  const db = openBunDatabase(path.resolve(process.env.FILE_DIRECTORY || './files'));
  const runtime = await startRuntime({
    db,
    tableName: process.env.STREAMS_TABLE ?? TABLE_NAMES.STREAMS,
    spawn: spawn as never,
    ports: {
      basePort: envInt('SUPERVISOR_BASE_PORT', 9001),
      max: envInt('SUPERVISOR_MAX_PORTS', 8),
    },
    healthPort: envInt('SUPERVISOR_HEALTH_PORT', 8080),
    healthHost: process.env.SUPERVISOR_HEALTH_HOST ?? '127.0.0.1',
    logDir: process.env.SUPERVISOR_LOG_DIR ?? './logs/streamlink-supervisor',
    logMaxBytes: envInt('SUPERVISOR_LOG_MAX_BYTES', 10 * 1024 * 1024),
    logRetain: envInt('SUPERVISOR_LOG_RETAIN', 5),
    streamlinkPath: process.env.STREAMLINK_PATH,
    ffmpegPath: process.env.FFMPEG_PATH,
    dashboardHtml,
  });

  const streams = runtime.supervisor.list();
  const baseUrl = `http://${process.env.SUPERVISOR_HEALTH_HOST ?? '127.0.0.1'}:${envInt('SUPERVISOR_HEALTH_PORT', 8080)}`;
  console.log(
    `[supervisor] started — ${streams.length} stream(s) supervised, ` +
    `dashboard ${baseUrl}/ — JSON ${baseUrl}/health`
  );
  streams.forEach(s => {
    console.log(`[supervisor]   ${s.streamId} → ${s.obsInputUrl}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[supervisor] received ${signal}, shutting down`);
    await runtime.shutdown();
    process.exit(0);
  };
  process.on('SIGINT', () => { void shutdown('SIGINT'); });
  process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
}

main().catch(err => {
  console.error('[supervisor] fatal:', err);
  process.exit(1);
});
