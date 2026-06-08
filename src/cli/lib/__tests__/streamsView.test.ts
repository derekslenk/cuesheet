import { summarizeStreams, formatStreamLines } from '../streamsView';
import type { StreamStatus } from '../types';

function s(over: Partial<StreamStatus> = {}): StreamStatus {
  return {
    streamId: 'alpha',
    status: 'running',
    restartCount: 0,
    obsInputUrl: 'udp://127.0.0.1:9001',
    ...over,
  };
}

describe('streamsView', () => {
  it('summarizes running / total', () => {
    expect(summarizeStreams([s(), s({ status: 'escalated' })])).toEqual({
      running: 1,
      total: 2,
      allRunning: false,
    });
    expect(summarizeStreams([])).toEqual({ running: 0, total: 0, allRunning: false });
    expect(summarizeStreams([s()])).toEqual({ running: 1, total: 1, allRunning: true });
  });

  it('renders a header plus one line per stream, with no ANSI when color is off', () => {
    const lines = formatStreamLines(
      [s({ streamId: 'a' }), s({ streamId: 'b', status: 'escalated', restartCount: 3 })],
      { color: false },
    );
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('streams: 1/2 running');
    expect(lines.join('\n')).not.toContain('\x1b['); // no color codes
    expect(lines[1]).toContain('a');
    expect(lines[2]).toContain('escalated');
    expect(lines[2]).toContain('r=3');
  });

  it('applies ANSI color when enabled (red for not-running)', () => {
    const lines = formatStreamLines([s({ status: 'escalated' })], { color: true });
    expect(lines.join('')).toContain('\x1b[31m');
  });

  it('marks a running-but-restarted stream as a warning', () => {
    const lines = formatStreamLines([s({ restartCount: 2 })], { color: true });
    expect(lines.join('')).toContain('\x1b[33m'); // yellow
  });

  it('handles the empty list', () => {
    expect(formatStreamLines([], { color: true })).toEqual(['  streams: none supervised']);
  });
});
