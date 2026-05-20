import { copyFileSync, existsSync, mkdirSync } from 'fs';
import { basename, join } from 'path';

export interface BackupSceneFileOptions {
  sceneFile: string;
  backupRoot: string;
  timestamp: string;
}

export interface BackupResult {
  backupPath: string;
  backupDir: string;
}

export function backupSceneFile(opts: BackupSceneFileOptions): BackupResult {
  if (!existsSync(opts.sceneFile)) {
    throw new Error(`scene file not found: ${opts.sceneFile}`);
  }
  const backupDir = join(opts.backupRoot, `scenes.backup.${opts.timestamp}`);
  if (existsSync(backupDir)) {
    throw new Error(`backup directory already exists: ${backupDir}`);
  }
  mkdirSync(backupDir, { recursive: true });

  const backupPath = join(backupDir, basename(opts.sceneFile));
  copyFileSync(opts.sceneFile, backupPath);
  return { backupPath, backupDir };
}

export interface RestoreFromBackupOptions {
  backupPath: string;
  sceneFile: string;
}

export function restoreFromBackup(opts: RestoreFromBackupOptions): void {
  if (!existsSync(opts.backupPath)) {
    throw new Error(`backup file not found: ${opts.backupPath}`);
  }
  copyFileSync(opts.backupPath, opts.sceneFile);
}
