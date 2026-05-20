/**
 * Drift guard: runtime API routes must not hard-code a `year:` literal
 * when looking up table names. Bumping DEFAULT_TABLE_CONFIG.year would
 * otherwise leave routes that hand-roll `getTableName(..., { year: 2025, ... })`
 * silently reading/writing the prior year's tables — split-brain against
 * the home page (which reads via TABLE_NAMES and follows the default).
 *
 * If a route really needs a non-default year (historical lookup,
 * cross-event reports), add the file path to ALLOWLIST below with a
 * comment explaining why.
 */

import fs from 'fs';
import path from 'path';

const API_ROOT = path.resolve(__dirname, '..');
const ALLOWLIST: string[] = [];

function collectRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...collectRouteFiles(full));
    } else if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('runtime API routes must not hard-code a table year', () => {
  it('no app/api/**/route.ts file contains a literal "year:" (excluding allowlist)', () => {
    const offenders: string[] = [];
    const files = collectRouteFiles(API_ROOT);
    const yearLiteral = /\byear\s*:\s*\d{4}\b/;

    for (const f of files) {
      const rel = path.relative(path.resolve(API_ROOT, '..', '..'), f);
      if (ALLOWLIST.includes(rel)) continue;

      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (yearLiteral.test(lines[i])) {
          offenders.push(`${rel}:${i + 1}  ${lines[i].trim()}`);
        }
      }
    }

    if (offenders.length > 0) {
      const msg = [
        'Hard-coded year literal(s) detected in runtime API routes.',
        'Use TABLE_NAMES.TEAMS / TABLE_NAMES.STREAMS so routes follow DEFAULT_TABLE_CONFIG:',
        '',
        ...offenders.map(o => `  ${o}`),
      ].join('\n');
      throw new Error(msg);
    }
  });
});
