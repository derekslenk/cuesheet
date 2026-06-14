/**
 * Tiny pure helpers for reading/updating a single `KEY=value` line in a dotenv
 * file's text. Used by scripts/switchEvent.ts to flip EVENT_KEY in .env.local
 * without disturbing the rest of the file. Pure string transforms — no I/O — so
 * they're unit-testable.
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Return the value of the first uncommented `KEY=...` line, or null. */
export function readEnvVar(content: string, key: string): string | null {
  const re = new RegExp(`^${escapeRegExp(key)}=(.*)$`, 'm');
  const m = re.exec(content);
  return m ? m[1] : null;
}

/**
 * Replace the first uncommented `KEY=...` line with `KEY=value`, or append it
 * (with a trailing newline) if absent. Other lines/comments are preserved.
 */
export function upsertEnvVar(content: string, key: string, value: string): string {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${escapeRegExp(key)}=.*$`, 'm');
  if (re.test(content)) return content.replace(re, line);
  const sep = content.length === 0 || content.endsWith('\n') ? '' : '\n';
  return `${content}${sep}${line}\n`;
}
