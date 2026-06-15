'use client';

import { useState, useEffect, useCallback } from 'react';
import { useApiKey } from '@/contexts/ApiKeyContext';

type LabelHealth = {
  renderer: string;
  shutdownWhenHidden: boolean;
  overlayBaseUrl: string;
  twitchConfigured: boolean;
  streamCount: number | null;
  teamsWithBranding: number | null;
  metrics: {
    overlayRequests: number;
    overlayUnknownId: number;
    viewerLookupFailures: number;
    overlayRequestFailures: number;
    lastUnknownId: string | null;
    lastUnknownAt: number | null;
  };
};

export default function SettingsPage() {
  const { apiKey, setApiKey, clearApiKey, isAuthenticated } = useApiKey();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // "Apply playback settings to existing OBS sources" — retrofits the current
  // OBS_RESTART_ON_ACTIVATE / close_when_inactive policy onto already-added
  // Media Sources so Studio-Mode preview/program behavior changes without
  // deleting and re-adding streams.
  const [playbackBusy, setPlaybackBusy] = useState(false);
  const [playbackMsg, setPlaybackMsg] = useState('');
  const [playbackErr, setPlaybackErr] = useState('');

  // Stream-label system health (renderer config, Twitch wiring, failure counts).
  const [labelHealth, setLabelHealth] = useState<LabelHealth | null>(null);
  const [labelHealthErr, setLabelHealthErr] = useState('');

  const loadLabelHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/overlay/health', { cache: 'no-store' });
      const data = await res.json();
      if (data?.ok) {
        setLabelHealth(data);
        setLabelHealthErr('');
      } else {
        setLabelHealthErr('Failed to load label health');
      }
    } catch {
      setLabelHealthErr('Failed to reach the server');
    }
  }, []);

  useEffect(() => {
    // Async loader — setState runs in the fetch callback, not synchronously in
    // the effect body, so this is the recommended pattern (false positive).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadLabelHealth();
  }, [loadLabelHealth]);

  const handleApplyPlayback = async () => {
    setPlaybackBusy(true);
    setPlaybackMsg('');
    setPlaybackErr('');
    try {
      const headers: Record<string, string> = {};
      if (apiKey) headers['x-api-key'] = apiKey;
      const res = await fetch('/api/obsPlaybackSettings', { method: 'POST', headers });
      const data = await res.json();
      if (res.ok && data.success) {
        setPlaybackMsg(data.message || 'Playback settings applied');
      } else {
        setPlaybackErr(data.details || data.error || 'Failed to apply playback settings');
      }
    } catch {
      setPlaybackErr('Failed to reach the server');
    } finally {
      setPlaybackBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setIsLoading(true);

    if (!inputValue.trim()) {
      setError('API key is required');
      setIsLoading(false);
      return;
    }

    // Test the API key by making a simple request
    try {
      const response = await fetch('/api/obsStatus', {
        headers: {
          'x-api-key': inputValue.trim()
        }
      });

      if (response.ok) {
        setApiKey(inputValue.trim());
        setInputValue('');
        setSuccess('API key saved successfully!');
      } else {
        setError('Invalid API key');
      }
    } catch {
      setError('Failed to validate API key');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClearKey = () => {
    clearApiKey();
    setInputValue('');
    setError('');
    setSuccess('API key cleared');
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl" style={{ paddingBottom: '48px' }}>
      <div className="glass-panel p-8">
        <h1 className="text-3xl font-bold text-white mb-8">Settings</h1>
        
        {/* API Key Section */}
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-white mb-4">API Key Authentication</h2>
            <p className="text-base1 mb-6">
              API keys are required when accessing this application from external networks. 
              The key is stored securely in your browser&apos;s local storage.
            </p>
          </div>

          {/* Current Status */}
          <div className="glass-panel p-4 border border-base01">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white mb-1">Current Status</h3>
                <div className="flex items-center gap-2">
                  {isAuthenticated ? (
                    <>
                      <div className="w-2 h-2 bg-green rounded-full"></div>
                      <span className="text-green text-sm">Authenticated</span>
                    </>
                  ) : (
                    <>
                      <div className="w-2 h-2 bg-yellow rounded-full"></div>
                      <span className="text-yellow text-sm">No API key set</span>
                    </>
                  )}
                </div>
              </div>
              {isAuthenticated && (
                <button
                  onClick={handleClearKey}
                  className="btn-secondary text-sm"
                >
                  Clear Key
                </button>
              )}
            </div>
          </div>

          {/* API Key Form */}
          <form onSubmit={handleSubmit} className="space-y-4" style={{ marginTop: '24px' }}>
            <div>
              <label htmlFor="apiKey" className="block text-sm font-medium text-base1 mb-2">
                {isAuthenticated ? 'Update API Key' : 'Enter API Key'}
              </label>
              <input
                type="password"
                id="apiKey"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                className="w-full text-white focus:outline-none focus:ring-2 focus:ring-blue transition-all"
                style={{
                  padding: '12px 24px',
                  background: 'rgba(7, 54, 66, 0.4)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(88, 110, 117, 0.3)',
                  borderRadius: '12px',
                  fontSize: '16px'
                }}
                placeholder="Enter your API key"
              />
            </div>

            {error && (
              <div className="glass-panel p-3 border border-red/30">
                <p className="text-red text-sm">{error}</p>
              </div>
            )}

            {success && (
              <div className="glass-panel p-3 border border-green/30">
                <p className="text-green text-sm">{success}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="btn w-full"
            >
              {isLoading ? 'Validating...' : (isAuthenticated ? 'Update API Key' : 'Save API Key')}
            </button>
          </form>

          {/* OBS Playback Settings Section */}
          <div className="glass-panel p-6 border border-base01" style={{ marginTop: '24px' }}>
            <h2 className="text-xl font-semibold text-white mb-2">OBS Playback Settings</h2>
            <p className="text-sm text-base1 mb-4">
              Re-applies the current playback policy (<code>OBS_RESTART_ON_ACTIVATE</code>,
              keep-warm, no clear-on-end) to every existing Media Source in OBS. Use this
              after changing the env var so Studio Mode preview/program behavior updates on
              streams you already added — no need to delete and re-add them.
            </p>

            {playbackErr && (
              <div className="glass-panel p-3 border border-red/30 mb-3">
                <p className="text-red text-sm">{playbackErr}</p>
              </div>
            )}
            {playbackMsg && (
              <div className="glass-panel p-3 border border-green/30 mb-3">
                <p className="text-green text-sm">{playbackMsg}</p>
              </div>
            )}

            <button
              onClick={handleApplyPlayback}
              disabled={playbackBusy}
              className="btn-secondary text-sm"
            >
              {playbackBusy ? 'Applying…' : 'Apply to existing OBS sources'}
            </button>
          </div>

          {/* Stream Label System health */}
          <div className="glass-panel p-6 border border-base01" style={{ marginTop: '24px' }}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-semibold text-white">Stream Label System</h2>
              <button onClick={loadLabelHealth} className="btn-secondary text-sm">
                Refresh
              </button>
            </div>
            <p className="text-sm text-base1 mb-4">
              Health of the HTML stream-label overlays. Watch the failure counters for
              silent on-air problems (a stale baked overlay URL shows as 404s).
            </p>

            {labelHealthErr && (
              <div className="glass-panel p-3 border border-red/30 mb-3">
                <p className="text-red text-sm">{labelHealthErr}</p>
              </div>
            )}

            {labelHealth && (
              <ul className="text-sm text-base1 space-y-1" style={{ paddingLeft: '8px' }}>
                <li>
                  Renderer: <span className="text-white">{labelHealth.renderer}</span>
                  {labelHealth.renderer !== 'html' && (
                    <span className="text-yellow"> (legacy OBS-native)</span>
                  )}
                </li>
                <li>
                  Overlay base URL: <code>{labelHealth.overlayBaseUrl}</code>
                </li>
                <li>
                  Twitch viewer counts:{' '}
                  {labelHealth.twitchConfigured ? (
                    <span className="text-green">configured</span>
                  ) : (
                    <span className="text-yellow">not configured — no count shown</span>
                  )}
                </li>
                <li>
                  Streams: <span className="text-white">{labelHealth.streamCount ?? '—'}</span>
                  {' · '}Teams branded:{' '}
                  <span className="text-white">{labelHealth.teamsWithBranding ?? '—'}</span>
                </li>
                <li className={labelHealth.metrics.overlayUnknownId > 0 ? 'text-red' : ''}>
                  Stale label hits (404): {labelHealth.metrics.overlayUnknownId}
                  {labelHealth.metrics.lastUnknownId
                    ? ` (last id ${labelHealth.metrics.lastUnknownId})`
                    : ''}
                </li>
                <li className={labelHealth.metrics.viewerLookupFailures > 0 ? 'text-yellow' : ''}>
                  Viewer lookup failures: {labelHealth.metrics.viewerLookupFailures}
                </li>
                <li className={labelHealth.metrics.overlayRequestFailures > 0 ? 'text-red' : ''}>
                  Overlay request failures (500): {labelHealth.metrics.overlayRequestFailures}
                </li>
              </ul>
            )}
          </div>

          {/* Information Section */}
          <div className="glass-panel p-6 border border-blue/30" style={{ marginTop: '24px' }}>
            <h3 className="font-medium text-blue text-sm mb-3">ℹ️ Information</h3>
            <ul className="text-xs text-base1 space-y-1" style={{ paddingLeft: '8px' }}>
              <li>API keys are only required for external network access</li>
              <li>Local network access bypasses authentication automatically</li>
              <li>Keys are validated against the server before saving</li>
              <li>Your API key is stored locally and never transmitted unnecessarily</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}