import { classifyRead } from '../classifyRead';

describe('classifyRead', () => {
  const validSet = new Set(['a', 'b', 'c']);

  it('returns ok when content is in the valid set', () => {
    expect(classifyRead({ outcome: { kind: 'content', content: 'a' }, validSet }).bucket).toBe('ok');
  });

  it('returns empty for zero-byte content', () => {
    expect(classifyRead({ outcome: { kind: 'content', content: '' }, validSet }).bucket).toBe('empty');
  });

  it('returns enoent when the file is missing', () => {
    expect(classifyRead({ outcome: { kind: 'enoent' }, validSet }).bucket).toBe('enoent');
  });

  it('returns mismatch with truncated detail for content outside the valid set', () => {
    const c = classifyRead({ outcome: { kind: 'content', content: 'unexpected' }, validSet });
    expect(c.bucket).toBe('mismatch');
    expect(c.detail).toBe('unexpected');
  });

  it('truncates mismatch detail to ~64 chars', () => {
    const long = 'x'.repeat(80);
    const c = classifyRead({ outcome: { kind: 'content', content: long }, validSet });
    expect(c.bucket).toBe('mismatch');
    expect(c.detail).toMatch(/^x{64}…$/);
  });

  it('returns read_error when the read threw', () => {
    const c = classifyRead({
      outcome: { kind: 'error', errorMessage: 'EBUSY' },
      validSet,
    });
    expect(c.bucket).toBe('read_error');
    expect(c.detail).toBe('EBUSY');
  });
});
