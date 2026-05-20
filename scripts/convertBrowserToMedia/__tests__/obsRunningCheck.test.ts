import { isObsRunning } from '../obsRunningCheck';

describe('isObsRunning', () => {
  it('returns true when tasklist output includes the obs64.exe row', async () => {
    const exec = jest.fn().mockResolvedValue({
      stdout:
        '"Image Name","PID","Session Name","Session#","Mem Usage"\r\n' +
        '"obs64.exe","12345","Console","1","123,456 K"\r\n',
      stderr: '',
    });

    const running = await isObsRunning({ exec, platform: 'win32' });
    expect(running).toBe(true);
    expect(exec).toHaveBeenCalledWith(
      'tasklist /FI "IMAGENAME eq obs64.exe" /FO CSV /NH'
    );
  });

  it('returns false when tasklist reports "INFO: No tasks are running"', async () => {
    const exec = jest.fn().mockResolvedValue({
      stdout: 'INFO: No tasks are running which match the specified criteria.\r\n',
      stderr: '',
    });

    expect(await isObsRunning({ exec, platform: 'win32' })).toBe(false);
  });

  it('uses pgrep on darwin and returns true when the process is found', async () => {
    const exec = jest.fn().mockResolvedValue({ stdout: '12345\n', stderr: '' });
    const running = await isObsRunning({ exec, platform: 'darwin' });
    expect(running).toBe(true);
    expect(exec).toHaveBeenCalledWith('pgrep -x OBS');
  });

  it('returns false on darwin when pgrep exits non-zero (no match)', async () => {
    const exec = jest.fn().mockRejectedValue(Object.assign(new Error('exit 1'), { code: 1 }));
    expect(await isObsRunning({ exec, platform: 'darwin' })).toBe(false);
  });

  it('throws a clear error when pgrep fails for non-exit-1 reasons (binary missing, etc.)', async () => {
    const exec = jest.fn().mockRejectedValue(Object.assign(new Error('not found'), { code: 127 }));
    await expect(isObsRunning({ exec, platform: 'darwin' })).rejects.toThrow(/not found/);
  });

  it('rejects unsupported platforms with a clear message', async () => {
    const exec = jest.fn();
    await expect(isObsRunning({ exec, platform: 'linux' as 'win32' })).rejects.toThrow(
      /unsupported platform/
    );
    expect(exec).not.toHaveBeenCalled();
  });
});
