import { readFileSync, writeFileSync } from 'fs';
import { basename, dirname, extname, join } from 'path';
import { convertSceneJson, ConversionChange, ConversionMapping, ConversionWarning } from './transform';
import { isObsRunning, ExecFn } from './obsRunningCheck';
import { backupSceneFile } from './backup';

export interface RunConversionOptions {
  sceneFile: string;
  backupRoot: string;
  mapping: ConversionMapping;
  timestamp: string;
  exec: ExecFn;
  platform: NodeJS.Platform;
  dryRun?: boolean;
}

export interface ConversionSummary {
  changes: ConversionChange[];
  warnings: ConversionWarning[];
  backupPath?: string;
  diffPath?: string;
}

export async function runConversion(opts: RunConversionOptions): Promise<ConversionSummary> {
  if (Object.keys(opts.mapping).length === 0) {
    throw new Error('conversion mapping is empty — nothing to do');
  }

  if (!opts.dryRun) {
    const running = await isObsRunning({ exec: opts.exec, platform: opts.platform });
    if (running) {
      throw new Error(
        'refusing to run: OBS is currently running. ' +
        'Close OBS before converting the scene collection, or pass --dry-run.'
      );
    }
  }

  const sceneRaw = readFileSync(opts.sceneFile, 'utf8');
  const scene = JSON.parse(sceneRaw);
  const result = convertSceneJson(scene, opts.mapping);

  if (opts.dryRun) {
    const base = basename(opts.sceneFile, extname(opts.sceneFile));
    const diffPath = join(dirname(opts.sceneFile), `${base}.diff.json`);
    writeFileSync(diffPath, JSON.stringify(result.diff, null, 2));
    return { changes: result.changes, warnings: result.warnings, diffPath };
  }

  const { backupPath } = backupSceneFile({
    sceneFile: opts.sceneFile,
    backupRoot: opts.backupRoot,
    timestamp: opts.timestamp,
  });
  writeFileSync(opts.sceneFile, JSON.stringify(result.converted, null, 2));

  return { changes: result.changes, warnings: result.warnings, backupPath };
}
