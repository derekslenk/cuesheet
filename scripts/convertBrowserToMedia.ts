/**
 * Convert browser_source inputs in an OBS scene-collection JSON to ffmpeg_source
 * inputs pointing at the Streamlink supervisor's per-stream UDP endpoints.
 *
 * Safety contract (Phase 1.3 G1.3):
 *   - Refuses to run if obs64.exe / OBS is currently running.
 *   - Always creates a timestamped backup at <backupRoot>/scenes.backup.<ISO>/
 *     before writing the converted JSON.
 *   - --dry-run skips the OBS check and the file rewrite, emitting a .diff.json
 *     so the operator can review what would change.
 *   - Mapping (sourceName → udp URL) comes from --mapping-file <path.json> or
 *     from a live supervisor's /health endpoint (--supervisor-url).
 *
 * Usage:
 *   tsx scripts/convertBrowserToMedia.ts \
 *     --scene-file C:\Users\...\SaT.json \
 *     --supervisor-url http://127.0.0.1:8080 \
 *     [--dry-run]
 *
 *   tsx scripts/convertBrowserToMedia.ts \
 *     --scene-file C:\Users\...\SaT.json \
 *     --mapping-file ./mapping.json
 *
 * Exit codes: 0 success, 1 fatal error.
 */
import { readFileSync } from 'fs';
import { dirname, isAbsolute, resolve } from 'path';
import { exec as execCb } from 'child_process';
import { promisify } from 'util';
import { runConversion } from './convertBrowserToMedia/runConversion';
import { ConversionMapping } from './convertBrowserToMedia/transform';

const exec = promisify(execCb);

interface Args {
  sceneFile: string;
  backupRoot?: string;
  mappingFile?: string;
  supervisorUrl?: string;
  dryRun: boolean;
  timestamp?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Partial<Args> & { dryRun: boolean } = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--scene-file': out.sceneFile = argv[++i]; break;
      case '--backup-root': out.backupRoot = argv[++i]; break;
      case '--mapping-file': out.mappingFile = argv[++i]; break;
      case '--supervisor-url': out.supervisorUrl = argv[++i]; break;
      case '--timestamp': out.timestamp = argv[++i]; break;
      case '--dry-run': out.dryRun = true; break;
      case '-h':
      case '--help':
        console.log(readFileSync(resolve(__dirname, 'convertBrowserToMedia/README.md'), 'utf8'));
        process.exit(0);
      default:
        throw new Error(`unknown arg: ${a}`);
    }
  }
  if (!out.sceneFile) throw new Error('--scene-file is required');
  if (!out.mappingFile && !out.supervisorUrl) {
    throw new Error('either --mapping-file or --supervisor-url is required');
  }
  return out as Args;
}

async function loadMapping(args: Args): Promise<ConversionMapping> {
  if (args.mappingFile) {
    const raw = readFileSync(args.mappingFile, 'utf8');
    return JSON.parse(raw) as ConversionMapping;
  }
  const res = await fetch(`${args.supervisorUrl}/health`);
  if (!res.ok) throw new Error(`supervisor /health returned ${res.status}`);
  const body = await res.json() as { streams: Array<{ streamId: string; obsInputUrl: string }> };
  return Object.fromEntries(body.streams.map(s => [s.streamId, s.obsInputUrl]));
}

function defaultBackupRoot(sceneFile: string): string {
  return resolve(dirname(sceneFile), 'scenes.backup');
}

function isoTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').replace('Z', '');
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const sceneFile = isAbsolute(args.sceneFile) ? args.sceneFile : resolve(args.sceneFile);
  const mapping = await loadMapping(args);

  const summary = await runConversion({
    sceneFile,
    backupRoot: args.backupRoot ?? defaultBackupRoot(sceneFile),
    mapping,
    timestamp: args.timestamp ?? isoTimestamp(),
    exec,
    platform: process.platform,
    dryRun: args.dryRun,
  });

  console.log(`[convertBrowserToMedia] ${args.dryRun ? 'DRY RUN — ' : ''}${summary.changes.length} change(s)`);
  summary.changes.forEach(c =>
    console.log(`  ${c.name}: browser_source(${c.twitchUrl}) → ffmpeg_source(${c.obsInputUrl})`)
  );
  summary.warnings.forEach(w => console.warn(`  WARN ${w.name}: ${w.reason}`));
  if (summary.backupPath) console.log(`  backup → ${summary.backupPath}`);
  if (summary.diffPath) console.log(`  diff   → ${summary.diffPath}`);
}

main().catch(err => {
  console.error('[convertBrowserToMedia] fatal:', err.message || err);
  process.exit(1);
});
