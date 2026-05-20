export interface RestartTrackerOptions {
  windowMs?: number;
  max?: number;
}

export class RestartTracker {
  private readonly windowMs: number;
  private readonly max: number;
  private readonly history = new Map<string, number[]>();

  constructor(opts: RestartTrackerOptions = {}) {
    this.windowMs = opts.windowMs ?? 30_000;
    this.max = opts.max ?? 3;
  }

  record(streamId: string, now: number = Date.now()): void {
    const existing = this.history.get(streamId) ?? [];
    existing.push(now);
    this.history.set(streamId, this.prune(existing, now));
  }

  shouldEscalate(streamId: string, now: number = Date.now()): boolean {
    const recent = this.prune(this.history.get(streamId) ?? [], now);
    this.history.set(streamId, recent);
    return recent.length >= this.max;
  }

  forget(streamId: string): void {
    this.history.delete(streamId);
  }

  private prune(timestamps: number[], now: number): number[] {
    const cutoff = now - this.windowMs;
    return timestamps.filter(t => t >= cutoff);
  }
}
