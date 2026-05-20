/**
 * Streamlink supervisor entry point.
 *
 * Reads the active stream list from the webui SQLite (sources.db), spawns
 * one streamlink → ffmpeg pair per stream pushing MPEG-TS to a per-stream
 * UDP port on 127.0.0.1, exposes /health on HTTP, and respawns on exit
 * with the 3-restarts-in-30s escalation policy from RestartTracker.
 *
 * Designed to run as a Windows service via NSSM on the OBS host.
 * See scripts/streamlink-supervisor/README.md for the install procedure.
 */
import { spawn } from 'child_process';
import { getDatabase } from '../../lib/database';
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
  const db = await getDatabase();
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
  });

  const streams = runtime.supervisor.list();
  console.log(
    `[supervisor] started — ${streams.length} stream(s) supervised, ` +
    `/health on http://${process.env.SUPERVISOR_HEALTH_HOST ?? '127.0.0.1'}:${envInt('SUPERVISOR_HEALTH_PORT', 8080)}`
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
