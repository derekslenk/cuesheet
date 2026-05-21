import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  isValidStrategy,
  pickStrategy,
  renameStrategy,
  strategyOutputBase,
  writeStrategy,
} from '../strategies';

describe('isValidStrategy', () => {
  it('accepts the two known strategies', () => {
    expect(isValidStrategy('write')).toBe(true);
    expect(isValidStrategy('rename')).toBe(true);
  });
  it('rejects unknown values', () => {
    expect(isValidStrategy('atomic')).toBe(false);
    expect(isValidStrategy('')).toBe(false);
  });
});

describe('pickStrategy', () => {
  it('returns writeStrategy for "write"', () => {
    expect(pickStrategy('write')).toBe(writeStrategy);
  });
  it('returns renameStrategy for "rename"', () => {
    expect(pickStrategy('rename')).toBe(renameStrategy);
  });
});

describe('strategyOutputBase', () => {
  it('produces a per-strategy file path under the given dir', () => {
    const dir = '/tmp/soak';
    expect(strategyOutputBase('write', dir)).toBe(path.join(dir, 'soak-write.txt'));
    expect(strategyOutputBase('rename', dir)).toBe(path.join(dir, 'soak-rename.txt'));
  });
});

describe('strategy IO', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'soak-strategy-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeStrategy writes the payload to the target', () => {
    const target = path.join(tmpDir, 'a.txt');
    writeStrategy({ targetPath: target, payload: 'hello' });
    expect(fs.readFileSync(target, 'utf8')).toBe('hello');
  });

  it('renameStrategy leaves only the target file (no leftover tmp)', () => {
    const target = path.join(tmpDir, 'b.txt');
    renameStrategy({ targetPath: target, payload: 'world' });
    expect(fs.readFileSync(target, 'utf8')).toBe('world');
    const leftovers = fs.readdirSync(tmpDir).filter(n => n !== 'b.txt');
    expect(leftovers).toEqual([]);
  });

  it('renameStrategy replaces existing content atomically (no partial state observed)', () => {
    const target = path.join(tmpDir, 'c.txt');
    fs.writeFileSync(target, 'first');
    renameStrategy({ targetPath: target, payload: 'second' });
    expect(fs.readFileSync(target, 'utf8')).toBe('second');
  });
});
