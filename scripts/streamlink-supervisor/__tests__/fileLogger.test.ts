import { mkdtempSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FileLogger } from '../fileLogger';

describe('FileLogger', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'sup-log-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('appends chunks to <name>.log', () => {
    const log = new FileLogger({ dir, name: 'team_alpha', maxBytes: 10_000, retain: 2 });
    log.write('hello\n');
    log.write('world\n');
    log.close();

    expect(readFileSync(join(dir, 'team_alpha.log'), 'utf8')).toBe('hello\nworld\n');
  });

  it('rotates to <name>.1.log when the file exceeds maxBytes', () => {
    const log = new FileLogger({ dir, name: 'team_alpha', maxBytes: 10, retain: 3 });
    log.write('1234567890');
    log.write('ABCDE');
    log.write('FGHIJ');
    log.close();

    expect(existsSync(join(dir, 'team_alpha.log'))).toBe(true);
    expect(existsSync(join(dir, 'team_alpha.1.log'))).toBe(true);
  });

  it('cascades rotation up to `retain` and discards anything older', () => {
    const log = new FileLogger({ dir, name: 'team_alpha', maxBytes: 5, retain: 2 });
    log.write('aaaaa');
    log.write('bbbbb');
    log.write('ccccc');
    log.write('ddddd');
    log.close();

    const files = readdirSync(dir).sort();
    expect(files).toEqual(expect.arrayContaining(['team_alpha.log', 'team_alpha.1.log']));
    expect(files).not.toContain('team_alpha.3.log');
  });

  it('keeps per-stream files isolated', () => {
    const a = new FileLogger({ dir, name: 'team_alpha', maxBytes: 10_000, retain: 2 });
    const b = new FileLogger({ dir, name: 'team_beta', maxBytes: 10_000, retain: 2 });
    a.write('alpha\n');
    b.write('beta\n');
    a.close();
    b.close();

    expect(readFileSync(join(dir, 'team_alpha.log'), 'utf8')).toBe('alpha\n');
    expect(readFileSync(join(dir, 'team_beta.log'), 'utf8')).toBe('beta\n');
  });

  it('returns disk usage across active + retained files', () => {
    const log = new FileLogger({ dir, name: 'team_alpha', maxBytes: 10, retain: 2 });
    log.write('1234567890'); // 10 bytes, hits max
    log.write('AB');         // rotates, then writes 2 bytes
    log.close();

    const used = log.diskBytes();
    const onDisk = statSync(join(dir, 'team_alpha.log')).size +
      statSync(join(dir, 'team_alpha.1.log')).size;
    expect(used).toBe(onDisk);
  });
});
