import { computeStats } from './stats';
import type { Stats } from './stats';
import { scheduleFireOffsets } from './schedule';
import { classifyResult } from './classifyResult';
import type { ResultBucket } from './classifyResult';
import { createPicker } from './picker';
import type { StreamRecord } from './picker';

export interface DriverOptions {
  webuiUrl: string;
  streams: readonly StreamRecord[];
  screens: readonly string[];
  calls: number;
  durationMs: number;
}

export interface FetchResponse {
  status: number;
  body: string;
}

export type FetchFn = (
  url: string,
  init: { method: 'POST'; headers: Record<string, string>; body: string }
) => Promise<FetchResponse>;

export interface Logger {
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface DriverDeps {
  fetchFn: FetchFn;
  now: () => number;
  setTimeoutFn: (cb: () => void, ms: number) => unknown;
  logger: Logger;
}

export interface CallFailure {
  index: number;
  screen: string;
  streamId: number;
  bucket: ResultBucket;
  detail?: string;
  latencyMs: number;
}

export interface DriverReport {
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  totalCalls: number;
  buckets: Record<ResultBucket, number>;
  httpStats: Stats;
  samples: number[];
  failures: CallFailure[];
}

const EMPTY_BUCKETS: () => Record<ResultBucket, number> = () => ({
  ok: 0,
  validation: 0,
  db_lock: 0,
  http_error: 0,
  network_error: 0,
});

export async function runDriver(opts: DriverOptions, deps: DriverDeps): Promise<DriverReport> {
  const offsets = scheduleFireOffsets(opts.calls, opts.durationMs);
  const picker = createPicker(opts.streams, opts.screens);
  const url = `${opts.webuiUrl.replace(/\/+$/, '')}/api/setActive`;

  const buckets = EMPTY_BUCKETS();
  const samples: number[] = [];
  const failures: CallFailure[] = [];
  const startedAt = new Date().toISOString();
  const startNow = deps.now();

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < offsets.length; i++) {
    const callIndex = i;
    const fireAt = offsets[i];
    const pick = picker();

    const task = new Promise<void>(resolve => {
      deps.setTimeoutFn(async () => {
        const t0 = deps.now();
        let outcome: { status: number; body: string } | { error: Error };
        try {
          const res = await deps.fetchFn(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ screen: pick.screen, id: pick.streamId }),
          });
          outcome = res;
        } catch (err) {
          outcome = { error: err instanceof Error ? err : new Error(String(err)) };
        }
        const t1 = deps.now();
        const latencyMs = Math.round(t1 - t0);
        samples.push(latencyMs);

        const classification =
          'error' in outcome
            ? classifyResult({ kind: 'network', message: outcome.error.message })
            : classifyResult({ kind: 'http', status: outcome.status, body: outcome.body });

        buckets[classification.bucket]++;
        if (classification.bucket !== 'ok') {
          failures.push({
            index: callIndex,
            screen: pick.screen,
            streamId: pick.streamId,
            bucket: classification.bucket,
            detail: classification.detail,
            latencyMs,
          });
        }

        resolve();
      }, fireAt);
    });
    tasks.push(task);
  }

  await Promise.all(tasks);

  const elapsedMs = Math.round(deps.now() - startNow);
  const finishedAt = new Date().toISOString();

  return {
    startedAt,
    finishedAt,
    elapsedMs,
    totalCalls: opts.calls,
    buckets,
    httpStats: computeStats(samples),
    samples,
    failures,
  };
}
