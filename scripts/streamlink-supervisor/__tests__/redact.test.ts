import { redactSecrets } from '../redact';

describe('redactSecrets (S2 — keep the Twitch OAuth token out of disk logs)', () => {
  it('redacts the token from a streamlink Authorization header line', () => {
    const line = '[streamlink] sending header Authorization=OAuth livecoaster123abc to twitch';
    expect(redactSecrets(line)).toBe(
      '[streamlink] sending header Authorization=OAuth [REDACTED] to twitch'
    );
  });

  it('is case-insensitive and redacts every occurrence', () => {
    expect(redactSecrets('oauth AAA then OAuth BBB')).toBe(
      'OAuth [REDACTED] then OAuth [REDACTED]'
    );
  });

  it('leaves lines without a token untouched', () => {
    expect(redactSecrets('error: connection refused on udp://127.0.0.1:9002')).toBe(
      'error: connection refused on udp://127.0.0.1:9002'
    );
  });

  it('does not leak the raw token', () => {
    const token = 'super-secret-token-value';
    expect(redactSecrets(`Authorization=OAuth ${token}`)).not.toContain(token);
  });
});
