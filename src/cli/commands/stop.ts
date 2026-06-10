/**
 * `cuesheet stop [--which both|sup|web]` — terminate EXACTLY the processes we
 * started (and nothing else).
 *
 * Replaces mon-stop.ps1, which killed by command-line substring (and a blanket
 * `Stop-Process streamlink, ffmpeg`) — that also killed unrelated node /
 * streamlink / ffmpeg, including load-test generators. Instead we read the
 * managed process records and kill only the tracked process groups via
 * lib/procState.killRecord (POSIX negative-PGID; win32 `taskkill /T` on the
 * tracked root). PID reuse is guarded by the recorded OS creation time
 * (isSafeToKill): a record whose live PID no longer matches is treated as
 * stale, cleared, and NOT killed (R4/AC6/AC7).
 *
 * Always exits 0 — stopping is idempotent. Re-running with nothing live clears
 * stale entries and reports success (AC6).
 */
import { parseArgs } from 'node:util';
import * as procState from '../lib/procState.js';
import { CliError, EXIT } from '../lib/exit.js';
import type { CommandContext, Role, Which } from '../lib/types.js';

export async function run(argv: string[], ctx: CommandContext): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: { which: { type: 'string', default: 'both' } },
    strict: false,
  });

  const which = normalizeWhich(values.which as string | undefined);
  const targetRoles = rolesFor(which);

  const records = procState.list(ctx.env).filter((r) => targetRoles.has(r.role));

  if (records.length === 0) {
    ctx.logger.info(`no tracked ${describe(which)} process to stop`);
    // Still reconcile so a stale entry for another role is cleaned eventually,
    // but only touch roles we were asked about below.
  }

  let stopped = 0;
  let cleared = 0;

  for (const record of records) {
    if (!procState.isLive(record)) {
      // Stale: the PID is gone. Clear the entry WITHOUT killing.
      procState.remove(record.role, ctx.env);
      cleared++;
      ctx.logger.warn(`cleared stale ${record.role} record (pid ${record.pid} not live)`);
      continue;
    }

    if (!procState.isSafeToKill(record)) {
      // The pid is live but is no longer OUR process (the OS reused it). Clear
      // the record WITHOUT killing — signalling it would hit an unrelated
      // process, exactly the mon-stop.ps1 bug we set out to avoid.
      procState.remove(record.role, ctx.env);
      cleared++;
      ctx.logger.warn(`cleared ${record.role} record (pid ${record.pid} reused by an unrelated process; not killing)`);
      continue;
    }

    const gone = procState.killRecord(record);
    procState.remove(record.role, ctx.env);
    if (gone) {
      stopped++;
      ctx.logger.info(`stopped ${record.role} (pid ${record.pid})`);
    } else {
      // killRecord did its best (SIGTERM→SIGKILL / taskkill /F); if the process
      // somehow survived, surface it but still drop the record so we don't keep
      // pointing at a process we can no longer manage.
      ctx.logger.warn(`requested stop of ${record.role} (pid ${record.pid}) but it may still be running`);
    }
  }

  if (stopped === 0 && cleared === 0 && records.length === 0) {
    // nothing to do — already logged above
  } else {
    ctx.logger.info(`stop complete: ${stopped} stopped, ${cleared} stale cleared`);
  }

  // Idempotent success regardless of how much there was to stop.
  process.exitCode = EXIT.OK;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeWhich(raw: string | undefined): Which {
  const v = (raw ?? 'both').toLowerCase();
  if (v === 'both' || v === 'sup' || v === 'web') return v;
  throw new CliError(`invalid --which '${raw}' (expected both|sup|web)`, EXIT.USAGE);
}

function rolesFor(which: Which): Set<Role> {
  if (which === 'sup') return new Set<Role>(['sup']);
  if (which === 'web') return new Set<Role>(['web']);
  return new Set<Role>(['sup', 'web']);
}

function describe(which: Which): string {
  return which === 'both' ? 'dev/supervisor' : which;
}
