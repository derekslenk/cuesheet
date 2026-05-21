import fs from 'fs';
import os from 'os';
import path from 'path';
import { atomicWriteFileSync } from '../atomicWrite';

describe('atomicWriteFileSync', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes the payload to the target path', () => {
    const target = path.join(tmpDir, 'large.txt');
    atomicWriteFileSync(target, 'team_red_alpha_stream');
    expect(fs.readFileSync(target, 'utf8')).toBe('team_red_alpha_stream');
  });

  it('leaves no .tmp- siblings behind after a successful write', () => {
    const target = path.join(tmpDir, 'large.txt');
    atomicWriteFileSync(target, 'a');
    atomicWriteFileSync(target, 'b');
    atomicWriteFileSync(target, 'c');
    const entries = fs.readdirSync(tmpDir);
    expect(entries).toEqual(['large.txt']);
    expect(fs.readFileSync(target, 'utf8')).toBe('c');
  });

  it('replaces existing content (overwrite path)', () => {
    const target = path.join(tmpDir, 'large.txt');
    fs.writeFileSync(target, 'old');
    atomicWriteFileSync(target, 'new');
    expect(fs.readFileSync(target, 'utf8')).toBe('new');
  });

  it('produces unique tmp paths under rapid succession', () => {
    const observedTmps = new Set<string>();
    const origRename = fs.renameSync;
    const spy = jest.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      observedTmps.add(from as string);
      return origRename(from, to);
    });
    try {
      const target = path.join(tmpDir, 'rapid.txt');
      for (let i = 0; i < 10; i++) {
        atomicWriteFileSync(target, `payload-${i}`);
      }
      expect(observedTmps.size).toBe(10);
    } finally {
      spy.mockRestore();
    }
  });

  it('cleans up tmp file when rename fails', () => {
    const target = path.join(tmpDir, 'fail.txt');
    const renameSpy = jest.spyOn(fs, 'renameSync').mockImplementation(() => {
      throw new Error('simulated EPERM');
    });
    try {
      expect(() => atomicWriteFileSync(target, 'oops')).toThrow(/simulated EPERM/);
      const leftovers = fs.readdirSync(tmpDir);
      expect(leftovers).toEqual([]);
    } finally {
      renameSpy.mockRestore();
    }
  });
});
