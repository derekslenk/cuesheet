'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

interface ApiKeyContextType {
  apiKey: string | null;
  setApiKey: (key: string) => void;
  clearApiKey: () => void;
  isAuthenticated: boolean;
}

const ApiKeyContext = createContext<ApiKeyContextType | undefined>(undefined);

export function ApiKeyProvider({ children }: { children: React.ReactNode }) {
  const [apiKey, setApiKeyState] = useState<string | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load API key from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('obs-api-key');
    if (stored) {
      setApiKeyState(stored);
    }
    setIsLoaded(true);
  }, []);

  const setApiKey = (key: string) => {
    localStorage.setItem('obs-api-key', key);
    setApiKeyState(key);
  };

  const clearApiKey = () => {
    localStorage.removeItem('obs-api-key');
    setApiKeyState(null);
  };

  const isAuthenticated = Boolean(apiKey);

  // Don't render children until we've loaded the API key from storage
  if (!isLoaded) {
    return <div>Loading...</div>;
  }

  return (
    <ApiKeyContext.Provider value={{ apiKey, setApiKey, clearApiKey, isAuthenticated }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const context = useContext(ApiKeyContext);
  if (context === undefined) {
    throw new Error('useApiKey must be used within an ApiKeyProvider');
  }
  return context;
}