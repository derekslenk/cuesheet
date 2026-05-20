import { PortAllocator, PortExhaustedError } from '../portAllocator';

describe('PortAllocator', () => {
  it('allocates sequential ports starting from basePort', () => {
    const a = new PortAllocator({ basePort: 9001, max: 8 });
    expect(a.allocate()).toBe(9001);
    expect(a.allocate()).toBe(9002);
    expect(a.allocate()).toBe(9003);
  });

  it('reuses the lowest released port before climbing higher', () => {
    const a = new PortAllocator({ basePort: 9001, max: 8 });
    a.allocate(); // 9001
    a.allocate(); // 9002
    a.allocate(); // 9003
    a.release(9002);
    expect(a.allocate()).toBe(9002);
    expect(a.allocate()).toBe(9004);
  });

  it('throws PortExhaustedError when the budget is exhausted', () => {
    const a = new PortAllocator({ basePort: 9001, max: 2 });
    a.allocate();
    a.allocate();
    expect(() => a.allocate()).toThrow(PortExhaustedError);
  });

  it('releasing an unallocated port is a no-op (idempotent cleanup)', () => {
    const a = new PortAllocator({ basePort: 9001, max: 2 });
    expect(() => a.release(9001)).not.toThrow();
    expect(a.allocate()).toBe(9001);
  });

  it('reports the active ports in allocation order', () => {
    const a = new PortAllocator({ basePort: 9001, max: 8 });
    a.allocate();
    a.allocate();
    a.allocate();
    a.release(9002);
    expect(a.active()).toEqual([9001, 9003]);
  });
});
