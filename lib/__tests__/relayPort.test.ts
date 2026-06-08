import {
  relayPort,
  relayUdpUrl,
  previewPort,
  previewUdpUrl,
  previewPortFor,
  RELAY_BASE_PORT,
  RELAY_PORT_RANGE,
  RELAY_PREVIEW_OFFSET,
} from '../relayPort';

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

describe('previewPort', () => {
  it('is relayPort + RELAY_PREVIEW_OFFSET', () => {
    expect(previewPort(1)).toBe(relayPort(1) + RELAY_PREVIEW_OFFSET);
    expect(previewPortFor(relayPort(42))).toBe(relayPort(42) + RELAY_PREVIEW_OFFSET);
  });

  it('never collides with any relay port across the event range', () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    const relayPorts = new Set(ids.map(relayPort));
    const previewPorts = ids.map(previewPort);
    // The preview band sits entirely above the relay band — zero overlap.
    previewPorts.forEach(p => expect(relayPorts.has(p)).toBe(false));
  });

  it('is deterministic and distinct per id (so the webui packager and the tee target agree)', () => {
    expect(previewPort(7)).toBe(previewPort(7));
    const ids = Array.from({ length: 60 }, (_, i) => i + 1);
    expect(new Set(ids.map(previewPort)).size).toBe(ids.length);
  });

  it('builds a preview udp url for the id', () => {
    expect(previewUdpUrl(1)).toBe(`udp://127.0.0.1:${relayPort(1) + RELAY_PREVIEW_OFFSET}`);
  });

  it('rejects invalid ids (same contract as relayPort)', () => {
    expect(() => previewPort(0)).toThrow();
    expect(() => previewPort('abc')).toThrow();
  });
});
