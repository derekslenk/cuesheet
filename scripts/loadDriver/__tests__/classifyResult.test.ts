import { classifyResult } from '../classifyResult';

describe('classifyResult', () => {
  it('classifies 2xx as ok', () => {
    expect(classifyResult({ kind: 'http', status: 200, body: 'whatever' }).bucket).toBe('ok');
    expect(classifyResult({ kind: 'http', status: 201, body: '' }).bucket).toBe('ok');
  });

  it('classifies 400/422 as validation', () => {
    expect(classifyResult({ kind: 'http', status: 400, body: '{"error":"Validation failed"}' }).bucket).toBe('validation');
    expect(classifyResult({ kind: 'http', status: 422, body: 'whatever' }).bucket).toBe('validation');
  });

  it('classifies "database is locked" in a 500 body as db_lock (Phase 1.4 pass criterion)', () => {
    const res = classifyResult({
      kind: 'http',
      status: 500,
      body: '{"error":"Database Error","message":"Database operation failed: fetch stream","details":"SQLITE_BUSY: database is locked"}',
    });
    expect(res.bucket).toBe('db_lock');
    expect(res.detail).toContain('database is locked');
  });

  it('also catches SQLITE_BUSY without the human phrase', () => {
    const res = classifyResult({ kind: 'http', status: 500, body: 'SQLITE_BUSY' });
    expect(res.bucket).toBe('db_lock');
  });

  it('classifies other 5xx as http_error', () => {
    expect(classifyResult({ kind: 'http', status: 500, body: 'kaboom' }).bucket).toBe('http_error');
    expect(classifyResult({ kind: 'http', status: 502, body: '' }).bucket).toBe('http_error');
  });

  it('classifies network errors (fetch threw) as network_error', () => {
    const res = classifyResult({ kind: 'network', message: 'ECONNREFUSED' });
    expect(res.bucket).toBe('network_error');
    expect(res.detail).toBe('ECONNREFUSED');
  });

  it('classifies unexpected 3xx as http_error', () => {
    expect(classifyResult({ kind: 'http', status: 302, body: '' }).bucket).toBe('http_error');
  });
});
