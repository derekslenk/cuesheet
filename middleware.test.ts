/**
 * Characterization tests for the API auth middleware.
 *
 * These deliberately PIN the current — intentionally permissive — posture so any
 * future change to it is a conscious, reviewed diff rather than a silent
 * regression: fail-open when API_KEY is unset, a spoofable Host bypass, and a
 * query-param key. See docs/full-review-2026-06 (S-F1 / T-C1).
 */

// jest.setup.js globally mocks next/server with ONLY NextResponse.json (no
// `.next`). Override it here so both helpers exist and return inspectable
// sentinels.
jest.mock('next/server', () => ({
  NextResponse: {
    next: jest.fn(() => ({ __kind: 'next' })),
    json: jest.fn((body, init) => ({ __kind: 'json', body, status: init?.status ?? 200 })),
  },
}));

import { middleware } from './middleware';

type ReqInit = {
  pathname?: string;
  method?: string;
  headers?: Record<string, string>;
  query?: string;
};

function makeRequest({ pathname = '/api/streams', method = 'GET', headers = {}, query = '' }: ReqInit = {}) {
  const lower = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method,
    nextUrl: { pathname, searchParams: new URLSearchParams(query) },
    headers: { get: (name: string) => lower.get(name.toLowerCase()) ?? null },
  } as unknown as Parameters<typeof middleware>[0];
}

type MwResult = { __kind: 'next' } | { __kind: 'json'; body: unknown; status: number };
const run = (init?: ReqInit): MwResult => middleware(makeRequest(init)) as unknown as MwResult;

describe('API auth middleware', () => {
  const ORIGINAL_KEY = process.env.API_KEY;
  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = ORIGINAL_KEY;
  });

  it('passes non-/api/ paths straight through', () => {
    process.env.API_KEY = 'secret';
    expect(run({ pathname: '/dashboard', headers: { host: 'evil.example.com' } }).__kind).toBe('next');
  });

  it('allows OPTIONS preflight without a key', () => {
    process.env.API_KEY = 'secret';
    expect(run({ method: 'OPTIONS', headers: { host: 'evil.example.com' } }).__kind).toBe('next');
  });

  it('RED FLAG: fails OPEN (allows all) when API_KEY is unset', () => {
    delete process.env.API_KEY;
    expect(run({ headers: { host: 'evil.example.com' } }).__kind).toBe('next');
  });

  it('RED FLAG: a spoofable Host: 192.168.* header bypasses the key entirely', () => {
    process.env.API_KEY = 'secret';
    // No key supplied — a co-network attacker just sets the Host header.
    expect(run({ headers: { host: '192.168.1.50' } }).__kind).toBe('next');
  });

  it('RED FLAG: a localhost Host header also bypasses the key', () => {
    process.env.API_KEY = 'secret';
    expect(run({ headers: { host: 'localhost:3000' } }).__kind).toBe('next');
  });

  it('RED FLAG: accepts the key via ?apikey= query param (leaks into URLs/logs)', () => {
    process.env.API_KEY = 'secret';
    expect(run({ headers: { host: 'evil.example.com' }, query: 'apikey=secret' }).__kind).toBe('next');
  });

  it('401s an external request with no key', () => {
    process.env.API_KEY = 'secret';
    const res = run({ headers: { host: 'evil.example.com' } });
    expect(res.__kind).toBe('json');
    if (res.__kind === 'json') expect(res.status).toBe(401);
  });

  it('401s an external request with a wrong key', () => {
    process.env.API_KEY = 'secret';
    const res = run({ headers: { host: 'evil.example.com', 'x-api-key': 'nope' } });
    expect(res.__kind).toBe('json');
    if (res.__kind === 'json') expect(res.status).toBe(401);
  });

  it('allows an external request with the correct x-api-key header', () => {
    process.env.API_KEY = 'secret';
    expect(run({ headers: { host: 'evil.example.com', 'x-api-key': 'secret' } }).__kind).toBe('next');
  });
});
