export type ExecFn = (command: string) => Promise<{ stdout: string; stderr: string }>;

export interface IsObsRunningOptions {
  exec: ExecFn;
  platform: NodeJS.Platform;
}

export async function isObsRunning(opts: IsObsRunningOptions): Promise<boolean> {
  if (opts.platform === 'win32') {
    const { stdout } = await opts.exec('tasklist /FI "IMAGENAME eq obs64.exe" /FO CSV /NH');
    return /obs64\.exe/i.test(stdout);
  }
  if (opts.platform === 'darwin') {
    try {
      const { stdout } = await opts.exec('pgrep -x OBS');
      return stdout.trim().length > 0;
    } catch (err) {
      const code = (err as { code?: number }).code;
      if (code === 1) return false; // pgrep exit 1 = no matches
      throw err;
    }
  }
  throw new Error(`unsupported platform: ${opts.platform}`);
}
