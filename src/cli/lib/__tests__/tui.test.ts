/**
 * Smoke tests for lib/tui.ts utility helpers.
 *
 * Only the pure, non-TTY helpers are tested here — the raw-mode and ANSI
 * rendering paths require a real TTY and are covered by manual inspection.
 */

import { linesToString, invalidate } from '../tui';

describe('tui – linesToString', () => {
  it('joins lines with newlines', () => {
    expect(linesToString(['foo', 'bar', 'baz'])).toBe('foo\nbar\nbaz');
  });

  it('returns empty string for empty array', () => {
    expect(linesToString([])).toBe('');
  });

  it('preserves empty lines', () => {
    expect(linesToString(['a', '', 'b'])).toBe('a\n\nb');
  });
});

describe('tui – invalidate', () => {
  it('does not throw', () => {
    expect(() => invalidate()).not.toThrow();
  });
});
