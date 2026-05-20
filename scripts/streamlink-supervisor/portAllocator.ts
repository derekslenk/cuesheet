export class PortExhaustedError extends Error {
  constructor(basePort: number, max: number) {
    super(`PortAllocator exhausted: all ${max} ports starting at ${basePort} are in use`);
    this.name = 'PortExhaustedError';
  }
}

export interface PortAllocatorOptions {
  basePort: number;
  max: number;
}

export class PortAllocator {
  private readonly basePort: number;
  private readonly max: number;
  private readonly inUse = new Set<number>();
  private readonly allocationOrder: number[] = [];

  constructor(opts: PortAllocatorOptions) {
    this.basePort = opts.basePort;
    this.max = opts.max;
  }

  allocate(): number {
    for (let i = 0; i < this.max; i++) {
      const port = this.basePort + i;
      if (!this.inUse.has(port)) {
        this.inUse.add(port);
        this.allocationOrder.push(port);
        return port;
      }
    }
    throw new PortExhaustedError(this.basePort, this.max);
  }

  release(port: number): void {
    if (!this.inUse.delete(port)) return;
    const idx = this.allocationOrder.indexOf(port);
    if (idx >= 0) this.allocationOrder.splice(idx, 1);
  }

  active(): number[] {
    return [...this.allocationOrder];
  }
}
