// ESM mirror of runSoak.ts. Keep behavior identical to the .ts version.
import fs from 'fs';
import { classifyRead } from './classifyRead.mjs';

const emptyBuckets = () => ({
  ok: 0,
  empty: 0,
  enoent: 0,
  mismatch: 0,
  read_error: 0,
});

export function defaultReadFile(targetPath) {
  try {
    const buf = fs.readFileSync(targetPath);
    return { kind: 'content', content: buf.toString('utf8') };
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      return { kind: 'enoent' };
    }
    return {
      kind: 'error',
      errorMessage: err instanceof Error ? err.message : String(err),
    };
  }
}

export function runSoak(opts, deps) {
  if (opts.payloadSamples.length === 0) {
    throw new Error('payloadSamples must contain at least one entry');
  }
  if (opts.inFlightWindow < 1) {
    throw new Error('inFlightWindow must be >= 1');
  }

  return new Promise(resolve => {
    const startedAt = new Date().toISOString();
    const t0 = deps.now();

    const initial = opts.payloadSamples[0];
    deps.writeStrategy({ targetPath: opts.targetPath, payload: initial });
    let writes = 1;
    let writeCursor = 1;

    const recent = [initial];
    const validSet = new Set([initial]);

    const buckets = emptyBuckets();
    const failures = [];
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
          const dropped = recent.shift();
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
