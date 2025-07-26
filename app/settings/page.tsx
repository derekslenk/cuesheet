'use client';

import { useState } from 'react';
import { useApiKey } from '@/contexts/ApiKeyContext';

export default function SettingsPage() {
  const { setApiKey, clearApiKey, isAuthenticated } = useApiKey();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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