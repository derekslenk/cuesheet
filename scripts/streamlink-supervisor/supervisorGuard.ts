/**
 * Single-instance guard for the supervisor.
 *
 * On startup (called once at the top of startRuntime, before binding the health
 * port) the supervisor reclaims a previously-launched supervisor and registers
 * itself, so exactly one supervisor owns the port — regardless of whether it was
 * launched by `cuesheet start` or ad-hoc via `npm run supervisor`.
 *
 * It reuses lib/procState (the same primitive `cuesheet start/stop` use): we kill
 * a RECORDED pid (never one scraped from the port at kill time), and only after
 * `isSafeToKill` confirms the live pid still matches our process image — so a
 * reused/foreign pid is refused, never killed. This sidesteps the port→PID
 * TOCTOU/anti-pattern flagged in the design review. Windows-native: procState's
 * win32 path is `taskkill /PID <pid> /T /F` (reaps the streamlink/ffmpeg tree).
 *
 * Self-registering here also fixes the root cause: an ad-hoc `npm run supervisor`
 * is now tracked in run-state.json, so `cuesheet stop` reaps it too.
 */
import net from 'node:net';
import * as procState from '../../src/cli/lib/procState';
import type { ProcessRecord, Role } from '../../src/cli/lib/types';

export class SupervisorTakeoverRefusedError extends Error {
  constructor(public readonly pid: number, public readonly port: number) {
    super(
      `refusing to start: a process (pid ${pid}) holds supervisor port ${port} that cannot be ` +
        `verified as a cuesheet supervisor — stop it manually or set SUPERVISOR_PORT_GUARD=off`,
    );
    this.name = 'SupervisorTakeoverRefusedError';
  }
}

export class SupervisorPortBusyError extends Error {
  constructor(public readonly port: number, public readonly killedPid: number) {
    super(
      `supervisor port ${port} is still in use after killing the previous supervisor (pid ${killedPid})`,
    );
    this.name = 'SupervisorPortBusyError';
  }
}

export type SupervisorGuardAction = 'registered' | 'tookover' | 'skipped' | 'disabled';

export interface SupervisorGuardResult {
  action: SupervisorGuardAction;
  /** The pid that was killed (only on 'tookover'). */
  pid?: number;
}

/** Injectable seams so the unit test never spawns taskkill/tasklist or binds. */
export interface SupervisorGuardDeps {
  get(role: Role, env: NodeJS.ProcessEnv): ProcessRecord | undefined;
  isLive(r: ProcessRecord): boolean;
  isSafeToKill(r: ProcessRecord): boolean;
  killRecord(r: ProcessRecord): boolean;
  add(r: ProcessRecord, env: NodeJS.ProcessEnv): void;
  remove(role: Role, env: NodeJS.ProcessEnv): void;
  makeFingerprint(argv: readonly string[], cwd: string): string;
  waitPortFree(port: number, host: string, timeoutMs: number): Promise<boolean>;
  pid(): number;
  now(): string;
}

export interface EnsureSoleSupervisorOptions {
  env: NodeJS.ProcessEnv;
  cwd: string;
  healthPort: number;
  /** Ports recorded for this supervisor (e.g. [healthPort, basePort]). */
  ports: number[];
  host?: string;
  logPath?: string;
  portFreeTimeoutMs?: number;
}

const defaultDeps: SupervisorGuardDeps = {
  get: procState.get,
  isLive: procState.isLive,
  isSafeToKill: procState.isSafeToKill,
  killRecord: procState.killRecord,
  add: procState.add,
  remove: procState.remove,
  makeFingerprint: procState.makeFingerprint,
  waitPortFree: defaultWaitPortFree,
  pid: () => process.pid,
  // The supervisor's OWN creation time (not "now"): recording the true start
  // time lets procState.isSafeToKill match it tightly later, so `cuesheet stop`
  // and takeover work even across runtimes (tsx vs the compiled binary).
  now: () => new Date(Date.now() - process.uptime() * 1000).toISOString(),
};

/**
 * Ensure this process is the sole supervisor: reclaim a stale registered
 * supervisor (identity-verified) and register ourselves. Throws to fail-fast
 * rather than ever killing an unverifiable/foreign process.
 */
export async function ensureSoleSupervisor(
  opts: EnsureSoleSupervisorOptions,
  deps: Partial<SupervisorGuardDeps> = {},
): Promise<SupervisorGuardResult> {
  const d: SupervisorGuardDeps = { ...defaultDeps, ...deps };
  const { env, cwd, healthPort, ports } = opts;
  const host = opts.host ?? '127.0.0.1';
  const timeoutMs = opts.portFreeTimeoutMs ?? 3000;
  const logPath = opts.logPath ?? '';

  if ((env.SUPERVISOR_PORT_GUARD ?? '').trim().toLowerCase() === 'off') {
    return { action: 'disabled' };
  }

  const self = d.pid();
  let action: SupervisorGuardAction | undefined;
  let tookPid: number | undefined;

  const existing = d.get('sup', env);
  if (existing && existing.pid !== self) {
    if (d.isLive(existing)) {
      if (d.isSafeToKill(existing)) {
        // Verified stale supervisor → reclaim it.
        d.killRecord(existing);
        d.remove('sup', env);
        const freed = await d.waitPortFree(healthPort, host, timeoutMs);
        if (!freed) throw new SupervisorPortBusyError(healthPort, existing.pid);
        action = 'tookover';
        tookPid = existing.pid;
      } else {
        // Live but not provably ours (reused pid / different runtime / foreign).
        // Never kill a stranger — fail-fast with an actionable message.
        throw new SupervisorTakeoverRefusedError(existing.pid, healthPort);
      }
    } else {
      // Dead/stale record — clear it; we register below.
      d.remove('sup', env);
    }
  }

  // Self-register so we can be reaped later — unless `cuesheet start` already
  // recorded THIS pid (whose record carries the detached logPath; don't clobber).
  const current = d.get('sup', env);
  if (!current || current.pid !== self) {
    d.add(
      {
        role: 'sup',
        pid: self,
        startTime: d.now(),
        cmdFingerprint: d.makeFingerprint(process.argv, cwd),
        ports,
        logPath,
      },
      env,
    );
    action = action ?? 'registered';
  } else {
    action = action ?? 'skipped';
  }

  return tookPid === undefined ? { action: action! } : { action: action!, pid: tookPid };
}

/**
 * Drop our own `sup` record on clean shutdown — but ONLY if it still points at
 * this process (a successor that took over will have overwritten it with its own
 * pid; don't delete the successor's record). Best-effort, returns whether it
 * removed anything.
 */
export function releaseSupervisorRecord(
  env: NodeJS.ProcessEnv = process.env,
  deps: Partial<Pick<SupervisorGuardDeps, 'get' | 'remove' | 'pid'>> = {},
): boolean {
  const get = deps.get ?? defaultDeps.get;
  const remove = deps.remove ?? defaultDeps.remove;
  const pid = deps.pid ?? defaultDeps.pid;
  const rec = get('sup', env);
  if (rec && rec.pid === pid()) {
    remove('sup', env);
    return true;
  }
  return false;
}

/** Poll until `port` accepts a fresh LISTEN on `host`, or `timeoutMs` elapses. */
export async function defaultWaitPortFree(
  port: number,
  host: string,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await isPortFree(port, host)) return true;
    if (Date.now() >= deadline) return false;
    await delay(100);
  }
}

function isPortFree(port: number, host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', (err: NodeJS.ErrnoException) => {
      tester.close();
      // Only a bound port (EADDRINUSE) counts as "not free"; other errors fall
      // through to the real bind, which will surface them.
      resolve(err.code !== 'EADDRINUSE');
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    // exclusive:true forces SO_EXCLUSIVEADDRUSE on Windows so a held port
    // reliably raises EADDRINUSE (the default SO_REUSEADDR can let two listeners
    // share a port on win32, which would falsely report the port as free).
    tester.listen({ port, host, exclusive: true });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
