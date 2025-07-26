'use client';

import React, { useState } from 'react';
import { useApiKey } from '../contexts/ApiKeyContext';

interface ApiKeyPromptProps {
  show: boolean;
  onClose?: () => void;
}

export function ApiKeyPrompt({ show, onClose }: ApiKeyPromptProps) {
  const { setApiKey } = useApiKey();
  const [inputValue, setInputValue] = useState('');
  const [error, setError] = useState('');

  if (!show) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!inputValue.trim()) {
      setError('API key is required');
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
        onClose?.();
      } else {
        setError('Invalid API key');
      }
    } catch {
      setError('Failed to validate API key');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="glass-panel p-6 max-w-md w-full mx-4">
        <h2 className="text-xl font-bold text-white mb-4">API Key Required</h2>
        <p className="text-base1 mb-4">
          This application requires an API key for access. Please enter your API key to continue.
        </p>
        
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="apiKey" className="block text-sm font-medium text-base1 mb-2">
              API Key
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
              autoFocus
            />
            {error && (
              <p className="mt-2 text-sm text-red">{error}</p>
            )}
          </div>
          
          <div className="flex gap-3">
            <button
              type="submit"
              className="btn flex-1"
            >
              Authenticate
            </button>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="btn-secondary px-4 py-2 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export function ApiKeyBanner() {
  const { isAuthenticated, clearApiKey } = useApiKey();
  const [showPrompt, setShowPrompt] = useState(false);

  if (isAuthenticated) {
    return (
      <div className="glass-panel mx-4 mt-4 px-4 py-2 text-sm flex justify-between items-center border border-green/30">
        <span className="text-green flex items-center gap-2">
          <span className="text-green">✓</span>
          Authenticated
        </span>
        <div className="flex gap-3">
          <button
            onClick={() => setShowPrompt(true)}
            className="text-base1 hover:text-white underline transition-colors"
          >
            Change Key
          </button>
          <button
            onClick={clearApiKey}
            className="text-base1 hover:text-white underline transition-colors"
          >
            Logout
          </button>
        </div>
        <ApiKeyPrompt show={showPrompt} onClose={() => setShowPrompt(false)} />
      </div>
    );
  }

  return (
    <>
      <div className="glass-panel mx-4 mt-4 px-4 py-2 text-sm flex justify-between items-center border border-yellow/30">
        <span className="text-yellow flex items-center gap-2">
          <span className="text-yellow">⚠️</span>
          API key required for full access
        </span>
        <button
          onClick={() => setShowPrompt(true)}
          className="text-base1 hover:text-white underline transition-colors"
        >
          Enter API Key
        </button>
      </div>
      <ApiKeyPrompt show={showPrompt} onClose={() => setShowPrompt(false)} />
    </>
  );
}