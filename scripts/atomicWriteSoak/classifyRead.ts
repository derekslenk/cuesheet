export type ReadBucket = 'ok' | 'empty' | 'enoent' | 'mismatch' | 'read_error';

export interface ReadOutcome {
  kind: 'content' | 'enoent' | 'error';
  content?: string;
  errorMessage?: string;
}

export interface ClassifyInput {
  outcome: ReadOutcome;
  validSet: ReadonlySet<string>;
}

export interface Classification {
  bucket: ReadBucket;
  detail?: string;
}

/**
 * A read is "ok" only when the file content matches a value the writer
 * either just wrote or is still in the sliding "in-flight" set. Anything
 * else is a torn read of some flavor.
 *
 * ENOENT is bucketed separately from mismatch — on the `rename` strategy
 * the destination should never disappear (rename is atomic), so an
 * ENOENT there is a real defect; on the `write` strategy it's not
 * expected either, since we pre-seed the file.
 */
export function classifyRead({ outcome, validSet }: ClassifyInput): Classification {
  if (outcome.kind === 'enoent') {
    return { bucket: 'enoent' };
  }
  if (outcome.kind === 'error') {
    return { bucket: 'read_error', detail: outcome.errorMessage };
  }
  const content = outcome.content ?? '';
  if (content.length === 0) {
    return { bucket: 'empty' };
  }
  if (validSet.has(content)) {
    return { bucket: 'ok' };
  }
  return { bucket: 'mismatch', detail: content.length > 64 ? `${content.slice(0, 64)}…` : content };
}
