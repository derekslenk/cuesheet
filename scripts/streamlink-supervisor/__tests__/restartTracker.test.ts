import { RestartTracker } from '../restartTracker';

describe('RestartTracker', () => {
  describe('escalation policy (3 restarts in 30s window)', () => {
    it('does not escalate for an unknown stream', () => {
      const tracker = new RestartTracker();
      expect(tracker.shouldEscalate('team_alpha', 1000)).toBe(false);
    });

    it('does not escalate after a single restart', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      expect(tracker.shouldEscalate('team_alpha', 1100)).toBe(false);
    });

    it('does not escalate after 2 restarts within the window', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 5000);
      expect(tracker.shouldEscalate('team_alpha', 6000)).toBe(false);
    });

    it('escalates after 3 restarts within the 30s window', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 5000);
      tracker.record('team_alpha', 10000);
      expect(tracker.shouldEscalate('team_alpha', 11000)).toBe(true);
    });

    it('does NOT escalate when older restarts have fallen outside the window', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 2000);
      tracker.record('team_alpha', 40000);
      expect(tracker.shouldEscalate('team_alpha', 41000)).toBe(false);
    });

    it('tracks streams independently', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 2000);
      tracker.record('team_alpha', 3000);
      tracker.record('team_beta', 4000);
      expect(tracker.shouldEscalate('team_alpha', 4000)).toBe(true);
      expect(tracker.shouldEscalate('team_beta', 4000)).toBe(false);
    });
  });

  describe('configurable window and threshold', () => {
    it('respects a custom windowMs and max', () => {
      const tracker = new RestartTracker({ windowMs: 10_000, max: 2 });
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 5000);
      expect(tracker.shouldEscalate('team_alpha', 6000)).toBe(true);
    });
  });

  describe('reset', () => {
    it('forget() clears a stream so it starts fresh', () => {
      const tracker = new RestartTracker();
      tracker.record('team_alpha', 1000);
      tracker.record('team_alpha', 2000);
      tracker.record('team_alpha', 3000);
      tracker.forget('team_alpha');
      expect(tracker.shouldEscalate('team_alpha', 4000)).toBe(false);
    });
  });
});
