/**
 * Redact secrets from a log/stderr line before it is written to disk.
 *
 * streamlink can echo the Twitch `Authorization=OAuth <token>` header into its
 * stderr, which the supervisor appends verbatim to rotating logs (S2). Strip the
 * token so the credential never lands on disk.
 */
export function redactSecrets(text: string): string {
  return text.replace(/OAuth\s+\S+/gi, 'OAuth [REDACTED]');
}
