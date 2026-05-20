import { scheduleFireOffsets } from '../schedule';

describe('scheduleFireOffsets', () => {
  it('returns 100 evenly spaced offsets across 60 000 ms (Phase 1.4 default)', () => {
    const offsets = scheduleFireOffsets(100, 60000);
    expect(offsets).toHaveLength(100);
    expect(offsets[0]).toBe(0);

    const last = offsets[offsets.length - 1];
    expect(last).toBeLessThan(60000);
    expect(last).toBeGreaterThan(59000);

    const diffs = offsets.slice(1).map((t, i) => t - offsets[i]);
    const meanDiff = diffs.reduce((a, b) => a + b, 0) / diffs.length;
    expect(meanDiff).toBeCloseTo(60000 / 100, 5);
    for (const d of diffs) {
      expect(Math.abs(d - meanDiff)).toBeLessThan(1);
    }
  });

  it('first offset is always 0', () => {
    expect(scheduleFireOffsets(5, 1000)[0]).toBe(0);
    expect(scheduleFireOffsets(1, 1000)[0]).toBe(0);
  });

  it('returns ascending offsets', () => {
    const offsets = scheduleFireOffsets(50, 30000);
    for (let i = 1; i < offsets.length; i++) {
      expect(offsets[i]).toBeGreaterThan(offsets[i - 1]);
    }
  });

  it('throws for non-positive count or duration', () => {
    expect(() => scheduleFireOffsets(0, 1000)).toThrow();
    expect(() => scheduleFireOffsets(-1, 1000)).toThrow();
    expect(() => scheduleFireOffsets(10, 0)).toThrow();
    expect(() => scheduleFireOffsets(10, -1)).toThrow();
  });

  it('handles count=1 (single fire at t=0)', () => {
    expect(scheduleFireOffsets(1, 60000)).toEqual([0]);
  });
});
