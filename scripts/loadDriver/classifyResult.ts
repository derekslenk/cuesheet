/**
 * Classify a single setActive call outcome.
 *
 * Phase 1.4 pass criteria specifically require "no SQLite 'database is locked'
 * errors" across 100 concurrent-ish calls — so db_lock is a dedicated bucket
 * separate from generic http_error.
 */

export type ResultBucket =
  | 'ok'
  | 'validation'
  | 'db_lock'
  | 'http_error'
  | 'network_error';

export type CallOutcome =
  | { kind: 'http'; status: number; body: string }
  | { kind: 'network'; message: string };

export interface Classification {
  bucket: ResultBucket;
  detail?: string;
}

const DB_LOCK_PATTERNS = [
  /database is locked/i,
  /SQLITE_BUSY/i,
];

export function classifyResult(outcome: CallOutcome): Classification {
  if (outcome.kind === 'network') {
    return { bucket: 'network_error', detail: outcome.message };
  }

  const { status, body } = outcome;

  if (status >= 200 && status < 300) {
    return { bucket: 'ok' };
  }

  if (status === 400 || status === 422) {
    return { bucket: 'validation', detail: body.slice(0, 200) };
  }

  for (const pat of DB_LOCK_PATTERNS) {
    const match = body.match(pat);
    if (match) {
      return { bucket: 'db_lock', detail: match[0] };
    }
  }

  return { bucket: 'http_error', detail: `HTTP ${status}: ${body.slice(0, 200)}` };
}
