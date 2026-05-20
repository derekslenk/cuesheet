/**
 * Evenly-spaced fire offsets from t=0 to (just before) durationMs.
 *
 * For Phase 1.4's "100 setActives in 60 s" → 100 offsets at 600 ms intervals,
 * starting at 0 and ending at 59 400 ms. The driver schedules a setTimeout
 * per offset; if a call takes longer than the interval the next one fires
 * on its own schedule (overlap is allowed by design — we want to see what
 * happens when the API is bursty).
 */
export function scheduleFireOffsets(count: number, durationMs: number): number[] {
  if (count <= 0) {
    throw new Error(`scheduleFireOffsets: count must be > 0 (got ${count})`);
  }
  if (durationMs <= 0) {
    throw new Error(`scheduleFireOffsets: durationMs must be > 0 (got ${durationMs})`);
  }
  if (count === 1) return [0];

  const interval = durationMs / count;
  const offsets: number[] = [];
  for (let i = 0; i < count; i++) {
    offsets.push(Math.round(i * interval));
  }
  return offsets;
}
