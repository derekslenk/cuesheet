import { EXIT, CliError } from '../exit';

describe('exit codes', () => {
  it('defines stable, distinct codes', () => {
    const vals = Object.values(EXIT);
    expect(new Set(vals).size).toBe(vals.length);
    expect(EXIT.OK).toBe(0);
    expect(EXIT.PORT_IN_USE).toBe(4);
  });

  it('CliError carries its exit code', () => {
    const e = new CliError('boom', EXIT.DEP_MISSING);
    expect(e.code).toBe(EXIT.DEP_MISSING);
    expect(e.message).toBe('boom');
    expect(e).toBeInstanceOf(Error);
  });

  it('defaults to GENERIC', () => {
    expect(new CliError('x').code).toBe(EXIT.GENERIC);
  });
});
