import fs from 'fs';
import { classifyRead } from './classifyRead';
import type { ReadBucket, ReadOutcome } from './classifyRead';
import type { StrategyName, WriteStrategy } from './strategies';

export interface SoakOptions {
  strategy: StrategyName;
  targetPath: string;
  durationMs: number;
  writeIntervalMs: number;
  readIntervalMs: number;
  inFlightWindow: number;
  payloadSamples: readonly string[];
}

export interface Logger {
  log: (msg: string) => void;
  warn: (msg: string) => void;
}

export interface SoakDeps {
  writeStrategy: WriteStrategy;
  readFile: (path: string) => ReadOutcome;
  now: () => number;
  setIntervalFn: (cb: () => void, ms: number) => NodeJS.Timeout;
  clearIntervalFn: (handle: NodeJS.Timeout) => void;
  setTimeoutFn: (cb: () => void, ms: number) => NodeJS.Timeout;
  logger: Logger;
}

export interface ReadFailure {
  atMs: number;
  bucket: Exclude<ReadBucket, 'ok'>;
  detail?: string;
}

export interface SoakReport {
  strategy: StrategyName;
  targetPath: string;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  writes: number;
  reads: number;
  buckets: Record<ReadBucket, number>;
  failures: ReadFailure[];
  passed: boolean;
}

const emptyBuckets = (): Record<ReadBucket, number> => ({
  ok: 0,
  empty: 0,
  enoent: 0,
  mismatch: 0,
  read_error: 0,
});

export function defaultReadFile(targetPath: string): ReadOutcome {
  try {
    const buf = fs.readFileSync(targetPath);
    return { kind: 'content', content: buf.toString('utf8') };
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') {
      return { kind: 'enoent' };
    }
    return { kind: 'error', errorMessage: err instanceof Error ? err.message : String(err) };
  }
}

export function runSoak(opts: SoakOptions, deps: SoakDeps): Promise<SoakReport> {
  if (opts.payloadSamples.length === 0) {
    throw new Error('payloadSamples must contain at least one entry');
  }
  if (opts.inFlightWindow < 1) {
    throw new Error('inFlightWindow must be >= 1');
  }

  return new Promise<SoakReport>(resolve => {
    const startedAt = new Date().toISOString();
    const t0 = deps.now();

    // Seed the target with the first payload so a reader that fires
    // before the first write doesn't see ENOENT.
    const initial = opts.payloadSamples[0];
    deps.writeStrategy({ targetPath: opts.targetPath, payload: initial });
    let writes = 1;
    let writeCursor = 1;

    // In-flight set: most recently written N values are considered valid.
    // We keep it as an array of recent values + a Set for O(1) lookup.
    const recent: string[] = [initial];
    const validSet = new Set<string>([initial]);

    const buckets = emptyBuckets();
    const failures: ReadFailure[] = [];
    let reads = 0;

    const writerHandle = deps.setIntervalFn(() => {
      const payload = opts.payloadSamples[writeCursor % opts.payloadSamples.length];
      writeCursor++;
      try {
        deps.writeStrategy({ targetPath: opts.targetPath, payload });
        writes++;
        recent.push(payload);
        validSet.add(payload);
        if (recent.length > opts.inFlightWindow) {
          const dropped = recent.shift()!;
          // Only drop from validSet when no remaining recent entry equals it.
          if (!recent.includes(dropped)) {
            validSet.delete(dropped);
          }
        }
      } catch (err) {
        deps.logger.warn(`writer error: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, opts.writeIntervalMs);

    const readerHandle = deps.setIntervalFn(() => {
      reads++;
      const outcome = deps.readFile(opts.targetPath);
      const classification = classifyRead({ outcome, validSet });
      buckets[classification.bucket]++;
      if (classification.bucket !== 'ok') {
        failures.push({
          atMs: Math.round(deps.now() - t0),
          bucket: classification.bucket,
          detail: classification.detail,
        });
      }
    }, opts.readIntervalMs);

    deps.setTimeoutFn(() => {
      deps.clearIntervalFn(writerHandle);
      deps.clearIntervalFn(readerHandle);
      const elapsedMs = Math.round(deps.now() - t0);
      const finishedAt = new Date().toISOString();
      const passed =
        buckets.empty === 0 &&
        buckets.enoent === 0 &&
        buckets.mismatch === 0 &&
        buckets.read_error === 0;
      resolve({
        strategy: opts.strategy,
        targetPath: opts.targetPath,
        startedAt,
        finishedAt,
        elapsedMs,
        writes,
        reads,
        buckets,
        failures,
        passed,
      });
    }, opts.durationMs);
  });
}
