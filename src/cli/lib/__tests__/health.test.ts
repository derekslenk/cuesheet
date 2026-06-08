/**
 * Unit tests for lib/health.ts
 *
 * Uses Jest's global fetch mock (jsdom env from next/jest config).
 * Each test stubs global.fetch so no real network calls are made.
 */

import { checkHealth } from '../health';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type FetchMock = jest.Mock<Promise<Response>>;

function mockFetch(responses: Record<string, { ok: boolean; status: number; statusText: string }>): FetchMock {
  return jest.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    // Match by prefix so /health and / both resolve.
    const entry = Object.entries(responses).find(([key]) => url.startsWith(key));
    if (!entry) {
      const err = new Error(`ECONNREFUSED: ${url}`);
      err.name = 'FetchError';
      throw err;
    }
    const { ok, status, statusText } = entry[1];
    return { ok, status, statusText } as Response;
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkHealth', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns up:true for both services when both respond 200', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch({
      'http://127.0.0.1:8080': { ok: true, status: 200, statusText: 'OK' },
      'http://localhost:3000': { ok: true, status: 200, statusText: 'OK' },
    });

    const results = await checkHealth();

    expect(results).toHaveLength(2);
    const sup = results.find((r) => r.service === 'sup')!;
    const web = results.find((r) => r.service === 'web')!;

    expect(sup.up).toBe(true);
    expect(sup.url).toBe('http://127.0.0.1:8080/health');
    expect(sup.latencyMs).toBeGreaterThanOrEqual(0);

    expect(web.up).toBe(true);
    expect(web.url).toBe('http://localhost:3000');
    expect(web.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns up:false with HTTP detail when supervisor returns 503', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch({
      'http://127.0.0.1:8080': { ok: false, status: 503, statusText: 'Service Unavailable' },
      'http://localhost:3000': { ok: true, status: 200, statusText: 'OK' },
    });

    const results = await checkHealth();
    const sup = results.find((r) => r.service === 'sup')!;

    expect(sup.up).toBe(false);
    expect(sup.detail).toContain('503');
  });

  it('returns up:false with error detail when fetch throws (connection refused)', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch({
      // Only web responds; sup will throw FetchError.
      'http://localhost:3000': { ok: true, status: 200, statusText: 'OK' },
    });

    const results = await checkHealth();
    const sup = results.find((r) => r.service === 'sup')!;

    expect(sup.up).toBe(false);
    expect(sup.detail).toBeTruthy();
    expect(sup.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('returns up:false for both when both are unreachable', async () => {
    (globalThis as unknown as Record<string, unknown>).fetch = mockFetch({});

    const results = await checkHealth();

    expect(results.every((r) => r.up === false)).toBe(true);
  });

  it('respects custom host/port overrides', async () => {
    const mock: FetchMock = jest.fn(async () => ({ ok: true, status: 200, statusText: 'OK' }) as Response);
    (globalThis as unknown as Record<string, unknown>).fetch = mock;

    await checkHealth({ supHost: '10.0.0.1', supPort: 9090, webHost: '10.0.0.2', webPort: 4000 });

    const urls = mock.mock.calls.map((c) => c[0] as string);
    expect(urls).toContain('http://10.0.0.1:9090/health');
    expect(urls).toContain('http://10.0.0.2:4000');
  });
});
