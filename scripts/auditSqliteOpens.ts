/**
 * Audit script: fails if any sqlite.open() call site appears outside the known allowlist.
 *
 * Usage: npx tsx scripts/auditSqliteOpens.ts
 * Exit 0 — found sites match the allowlist exactly.
 * Exit 1 — unexpected new sites found, or stale allowlist entries detected.
 */
import * as fs from 'fs';
import * as path from 'path';

const REPO_ROOT = process.cwd();
const ALLOWLIST_PATH = path.join(REPO_ROOT, 'scripts', 'auditSqliteOpens.allowlist.txt');
// Exclude this file itself — it naturally references the patterns it searches for.
const SELF_REL = path.join('scripts', 'auditSqliteOpens.ts');

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  '.omc',
  'obs-scene',
]);

/**
 * Patterns that identify a sqlite.open() call site:
 *   1. sqlite.open(  — direct call on the sqlite namespace object
 *   2. open({        — named import `open` called with an options object (sqlite package style)
 */
const SQLITE_OPEN_PATTERNS: RegExp[] = [
  /sqlite\.open\s*\(/,
  /\bopen\s*\(\s*\{/,
];

interface Finding {
  /** Path relative to REPO_ROOT */
  file: string;
  line: number;
  text: string;
}

function walkFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        results.push(...walkFiles(path.join(dir, entry.name)));
      }
    } else if (entry.isFile() && /\.(ts|tsx|js|mjs)$/.test(entry.name)) {
      results.push(path.join(dir, entry.name));
    }
  }
  return results;
}

function findSqliteOpenSites(files: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const absPath of files) {
    if (path.relative(REPO_ROOT, absPath) === SELF_REL) continue;
    const content = fs.readFileSync(absPath, 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      if (SQLITE_OPEN_PATTERNS.some((p) => p.test(lines[i]))) {
        findings.push({
          // Normalize to forward slashes so matching against the allowlist
          // (which uses '/') works on Windows, where path.relative yields '\'.
          file: path.relative(REPO_ROOT, absPath).split(path.sep).join('/'),
          line: i + 1,
          text: lines[i].trim(),
        });
      }
    }
  }
  return findings;
}

function loadAllowlist(): string[] {
  const raw = fs.readFileSync(ALLOWLIST_PATH, 'utf8');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith('#'));
}

function main(): void {
  if (!fs.existsSync(ALLOWLIST_PATH)) {
    console.error(`❌ Allowlist not found: ${ALLOWLIST_PATH}`);
    process.exit(1);
  }

  const allowlist = new Set(loadAllowlist());
  const files = walkFiles(REPO_ROOT);
  const findings = findSqliteOpenSites(files);

  // One allowlist entry per file; each finding carries the file path.
  const foundFiles = new Set(findings.map((f) => f.file));

  const unexpected = [...foundFiles].filter((f) => !allowlist.has(f)).sort();
  const missing = [...allowlist].filter((f) => !foundFiles.has(f)).sort();

  let failed = false;

  if (unexpected.length > 0) {
    console.error('❌ New sqlite.open() site(s) detected outside allowlist:');
    for (const file of unexpected) {
      const sites = findings.filter((f) => f.file === file);
      for (const s of sites) {
        console.error(`  ${s.file}:${s.line}  ${s.text}`);
      }
      console.error(
        `  → Migrate to withDb() (see lib/database.ts) or add to scripts/auditSqliteOpens.allowlist.txt if intentional.\n`
      );
    }
    failed = true;
  }

  if (missing.length > 0) {
    console.error('⚠️  Stale allowlist entries (no longer present in codebase):');
    for (const f of missing) {
      console.error(`  ${f}`);
    }
    console.error('  → Remove stale entries from scripts/auditSqliteOpens.allowlist.txt\n');
    failed = true;
  }

  if (!failed) {
    console.log(
      `✅ sqlite.open() audit passed — ${foundFiles.size} known site(s) all accounted for in allowlist.`
    );
    process.exit(0);
  } else {
    process.exit(1);
  }
}

main();
