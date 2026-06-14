import { readEnvVar, upsertEnvVar } from '../envFile';

describe('readEnvVar', () => {
  it('reads the first uncommented KEY= line', () => {
    expect(readEnvVar('A=1\nEVENT_KEY=summer\nB=2', 'EVENT_KEY')).toBe('summer');
  });
  it('returns null when absent', () => {
    expect(readEnvVar('A=1\nB=2', 'EVENT_KEY')).toBeNull();
  });
  it('does not match a commented line', () => {
    expect(readEnvVar('#EVENT_KEY=old\nA=1', 'EVENT_KEY')).toBeNull();
  });
});

describe('upsertEnvVar', () => {
  it('replaces an existing value, preserving other lines', () => {
    const out = upsertEnvVar('A=1\nEVENT_KEY=summer\nB=2', 'EVENT_KEY', 'testing_2026');
    expect(out).toBe('A=1\nEVENT_KEY=testing_2026\nB=2');
  });
  it('appends with a trailing newline when absent', () => {
    expect(upsertEnvVar('A=1\n', 'EVENT_KEY', 'x')).toBe('A=1\nEVENT_KEY=x\n');
  });
  it('adds a separating newline when the file lacks a trailing one', () => {
    expect(upsertEnvVar('A=1', 'EVENT_KEY', 'x')).toBe('A=1\nEVENT_KEY=x\n');
  });
  it('handles empty content', () => {
    expect(upsertEnvVar('', 'EVENT_KEY', 'x')).toBe('EVENT_KEY=x\n');
  });
  it('leaves a commented line alone and appends the real one', () => {
    expect(upsertEnvVar('#EVENT_KEY=old\n', 'EVENT_KEY', 'new')).toBe('#EVENT_KEY=old\nEVENT_KEY=new\n');
  });
});
