import { relayPort, relayUdpUrl, RELAY_BASE_PORT, RELAY_PORT_RANGE } from '../relayPort';

describe('relayPort', () => {
  it('is deterministic for a given id', () => {
    expect(relayPort(7)).toBe(relayPort(7));
  });

  it('maps id to BASE + (id % RANGE)', () => {
    expect(relayPort(1)).toBe(RELAY_BASE_PORT + 1);
    expect(relayPort(42)).toBe(RELAY_BASE_PORT + 42);
  });

  it('gives distinct ports to distinct ids across the event range (no collisions)', () => {
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    const ports = new Set(ids.map(relayPort));
    expect(ports.size).toBe(ids.length);
  });

  it('accepts numeric-string ids (SQLite lastID arrives as number, be lenient)', () => {
    expect(relayPort('5')).toBe(RELAY_BASE_PORT + 5);
  });

  it('builds a udp url for the id', () => {
    expect(relayUdpUrl(1)).toBe(`udp://127.0.0.1:${RELAY_BASE_PORT + 1}`);
  });

  it('rejects invalid ids', () => {
    expect(() => relayPort(0)).toThrow();
    expect(() => relayPort(-3)).toThrow();
    expect(() => relayPort('abc')).toThrow();
  });

  it('keeps ports within range when ids wrap', () => {
    expect(relayPort(RELAY_PORT_RANGE + 1)).toBe(RELAY_BASE_PORT + 1);
  });
});
