import {
  isValidUrl,
  isPositiveInteger,
  validateInteger,
  sanitizeString,
  isValidScreen,
  validateStreamInput,
  validateScreenInput,
  VALID_SCREENS,
} from '../security';

describe('isValidUrl', () => {
  it.each(['http://a.com', 'https://a.com/path?x=1', 'https://twitch.tv/foo'])('accepts %s', (u) => {
    expect(isValidUrl(u)).toBe(true);
  });

  // The protocol allowlist is the front-line guard against scheme-based payloads.
  it.each([
    'javascript:alert(1)',
    'data:text/html,<script>1</script>',
    'file:///etc/passwd',
    'ftp://a.com',
    'not a url',
    '',
  ])('rejects %s', (u) => {
    expect(isValidUrl(u)).toBe(false);
  });
});

describe('isPositiveInteger / validateInteger', () => {
  it.each([1, 5, 9999])('isPositiveInteger accepts %p', (n) => expect(isPositiveInteger(n)).toBe(true));
  it.each([0, -1, 1.5, NaN, '3', null, undefined])('isPositiveInteger rejects %p', (n) =>
    expect(isPositiveInteger(n)).toBe(false),
  );

  it('validateInteger returns the number for valid input', () => {
    expect(validateInteger('7')).toBe(7);
    expect(validateInteger(7)).toBe(7);
  });
  it('validateInteger returns null for invalid input', () => {
    expect(validateInteger('abc')).toBeNull();
    expect(validateInteger(0)).toBeNull();
    expect(validateInteger(-3)).toBeNull();
    expect(validateInteger(1.5)).toBeNull();
  });
});

describe('sanitizeString', () => {
  it('strips dangerous characters', () => {
    expect(sanitizeString('A<b>"/\\&c')).toBe('Abc');
  });
  it('trims surrounding whitespace', () => {
    expect(sanitizeString('  hi  ')).toBe('hi');
  });
  it('truncates to the default max length (100)', () => {
    expect(sanitizeString('x'.repeat(150))).toHaveLength(100);
  });
  it('honors a custom max length', () => {
    expect(sanitizeString('abcdef', 3)).toBe('abc');
  });
});

describe('isValidScreen', () => {
  it.each([...VALID_SCREENS])('accepts %s', (s) => expect(isValidScreen(s)).toBe(true));
  it.each(['middle', 'LARGE', '', 'foo'])('rejects %s', (s) => expect(isValidScreen(s)).toBe(false));
});

describe('validateStreamInput', () => {
  it('accepts a clean stream and sanitizes the name', () => {
    const r = validateStreamInput({ name: 'Team <x>', url: 'https://twitch.tv/foo', team_id: 3 });
    expect(r.valid).toBe(true);
    expect(r.data?.name).toBe('Team x'); // <> stripped
    expect(r.data?.team_id).toBe(3);
  });
  it('rejects a javascript: url with the expected message', () => {
    const r = validateStreamInput({ name: 'A', url: 'javascript:alert(1)', team_id: 1 });
    expect(r.valid).toBe(false);
    expect(r.errors).toContain('URL must be a valid http:// or https:// URL');
  });
  it('rejects a missing / non-string name', () => {
    expect(validateStreamInput({ url: 'https://x.com', team_id: 1 }).valid).toBe(false);
  });
  it('rejects a name over 100 characters', () => {
    expect(validateStreamInput({ name: 'x'.repeat(101), url: 'https://x.com', team_id: 1 }).valid).toBe(false);
  });
  it('rejects a non-positive or non-integer team_id', () => {
    expect(validateStreamInput({ name: 'A', url: 'https://x.com', team_id: 0 }).valid).toBe(false);
    expect(validateStreamInput({ name: 'A', url: 'https://x.com', team_id: '3' }).valid).toBe(false);
  });
  it('collects all errors at once, not just the first', () => {
    const r = validateStreamInput({ name: '', url: 'bad', team_id: -1 });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThanOrEqual(3);
  });
});

describe('validateScreenInput', () => {
  it('accepts a valid screen + id', () => {
    const r = validateScreenInput({ screen: 'large', id: 2 });
    expect(r.valid).toBe(true);
    expect(r.data).toEqual({ screen: 'large', id: 2 });
  });
  it('rejects an invalid screen', () => {
    expect(validateScreenInput({ screen: 'middle', id: 1 }).valid).toBe(false);
  });
  it('rejects a bad id', () => {
    expect(validateScreenInput({ screen: 'large', id: 0 }).valid).toBe(false);
  });
});
