/**
 * Drift guard: runtime API routes must not hard-code a table name or event
 * key. They must resolve tables through `TABLE_NAMES.STREAMS` / `.TEAMS`, which
 * follow the configured `EVENT_KEY` (lib/constants.ts). A route that hand-rolls
 * a literal table name (`'streams_2025_summer_sat'`) or calls
 * `getTableName(base, '<key>')` with an explicit override would silently read
 * or write a different event's tables than the rest of the app — split-brain
 * against every route that follows EVENT_KEY.
 *
 * This replaces the older `year:`-literal guard: with a single opaque EVENT_KEY
 * there is no year/season literal to scan for, so the guard now forbids the two
 * ways a route could pin a table out from under EVENT_KEY.
 *
 * If a route genuinely needs a non-default event (historical lookup,
 * cross-event reports), add its path to ALLOWLIST with a comment explaining why.
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

describe('runtime API routes must not hard-code a table name or event key', () => {
  it('no app/api/**/route.ts pins a table outside EVENT_KEY (excluding allowlist)', () => {
    const offenders: string[] = [];
    const files = collectRouteFiles(API_ROOT);

    // A quoted literal table name, e.g. 'streams_2025_summer_sat' or
    // "teams_worlds_2027" — routes should never embed one.
    const literalTableName = /['"`](streams|teams)_[a-z0-9_]+['"`]/i;
    // An explicit-key override: getTableName(base, '<key>'). The bare
    // TABLE_NAMES exports are fine; only a second argument pins the event.
    const getTableNameOverride = /getTableName\s*\([^)]*,[^)]*\)/;

    for (const f of files) {
      const rel = path.relative(path.resolve(API_ROOT, '..', '..'), f);
      if (ALLOWLIST.includes(rel)) continue;

      const content = fs.readFileSync(f, 'utf8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (literalTableName.test(lines[i]) || getTableNameOverride.test(lines[i])) {
          offenders.push(`${rel}:${i + 1}  ${lines[i].trim()}`);
        }
      }
    }

    if (offenders.length > 0) {
      const msg = [
        'Hard-coded table name / event key detected in runtime API routes.',
        'Use TABLE_NAMES.STREAMS / TABLE_NAMES.TEAMS so routes follow EVENT_KEY:',
        '',
        ...offenders.map(o => `  ${o}`),
      ].join('\n');
      throw new Error(msg);
    }
  });
});
