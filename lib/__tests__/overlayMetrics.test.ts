import {
  recordOverlayRequest,
  recordOverlayUnknownId,
  recordViewerLookupFailure,
  overlayMetricsSnapshot,
  __resetOverlayMetrics,
} from '../overlayMetrics';

beforeEach(() => __resetOverlayMetrics());

describe('overlayMetrics', () => {
  it('starts at zero', () => {
    expect(overlayMetricsSnapshot()).toEqual({
      overlayRequests: 0,
      overlayUnknownId: 0,
      viewerLookupFailures: 0,
      lastUnknownId: null,
      lastUnknownAt: null,
    });
  });

  it('counts requests / unknown ids / viewer failures and tracks the last unknown', () => {
    recordOverlayRequest();
    recordOverlayRequest();
    recordOverlayUnknownId('7', 123);
    recordViewerLookupFailure();

    const s = overlayMetricsSnapshot();
    expect(s.overlayRequests).toBe(2);
    expect(s.overlayUnknownId).toBe(1);
    expect(s.lastUnknownId).toBe('7');
    expect(s.lastUnknownAt).toBe(123);
    expect(s.viewerLookupFailures).toBe(1);
  });

  it('returns a copy, not a live reference', () => {
    const s = overlayMetricsSnapshot();
    recordOverlayRequest();
    expect(s.overlayRequests).toBe(0);
  });
});
