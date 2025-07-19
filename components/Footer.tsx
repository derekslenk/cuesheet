'use client';

import { useState } from 'react';
import { useSmartPolling, PerformanceMonitor } from '@/lib/performance';

type OBSStatus = {
  host: string;
  port: string;
  hasPassword: boolean;
  connected: boolean;
  version?: {
    obsVersion: string;
    obsWebSocketVersion: string;
  };
  currentScene?: string;
  sceneCount?: number;
  streaming?: boolean;
  recording?: boolean;
  error?: string;
};

export default function Footer() {
  const [obsStatus, setObsStatus] = useState<OBSStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Smart polling with performance monitoring and visibility detection
  const fetchOBSStatus = async () => {
    const endTimer = PerformanceMonitor.startTimer('obsStatus_fetch');
    try {
      const response = await fetch('/api/obsStatus');
      const data = await response.json();
      setObsStatus(data);
    } catch (error) {
      console.error('Failed to fetch OBS status:', error);
      // Set error state instead of leaving null
      setObsStatus(prev => prev ? { ...prev, error: 'Connection failed' } : null);
    } finally {
      setIsLoading(false);
      endTimer();
    }
  };

  // Use smart polling that respects page visibility and adapts interval based on connection status
  const pollingInterval = obsStatus?.connected ? 15000 : 30000; // Poll faster when connected
  useSmartPolling(fetchOBSStatus, pollingInterval, [obsStatus?.connected]);

  if (isLoading) {
    return (
      <footer className="glass p-6 mt-8">
        <div className="container text-center">
          <div className="text-sm opacity-60">Loading OBS status...</div>
        </div>
      </footer>
    );
  }

  return (
    <footer className="glass p-6 mt-8">
      <div className="container">
        <div className="grid-2">
          {/* Connection Status */}
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className={`w-3 h-3 rounded-full ${obsStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <div>
                <h3 className="font-semibold">OBS Studio</h3>
                <p className="text-sm opacity-60">
                  {obsStatus?.connected ? 'Connected' : 'Disconnected'}
                </p>
              </div>
            </div>
            
            {obsStatus && (
              <div className="text-sm opacity-80">
                <div>{obsStatus.host}:{obsStatus.port}</div>
                {obsStatus.hasPassword && <div>🔒 Authenticated</div>}
              </div>
            )}
          </div>

          {/* Live Status */}
          {obsStatus?.connected && (
            <div>
              <h3 className="font-semibold mb-4">Live Status</h3>
              
              <div className="space-y-2 text-sm">
                {obsStatus.currentScene && (
                  <div className="flex justify-between">
                    <span>Scene:</span>
                    <span className="font-medium">{obsStatus.currentScene}</span>
                  </div>
                )}
                
                {obsStatus.sceneCount !== null && (
                  <div className="flex justify-between">
                    <span>Total Scenes:</span>
                    <span className="font-medium">{obsStatus.sceneCount}</span>
                  </div>
                )}

                <div className="flex gap-4 mt-4">
                  <div className={`flex items-center gap-2 ${obsStatus.streaming ? 'text-red-400' : 'opacity-60'}`}>
                    <div className={`w-2 h-2 rounded-full ${obsStatus.streaming ? 'bg-red-500' : 'bg-gray-500'}`}></div>
                    <span className="text-sm">{obsStatus.streaming ? 'LIVE' : 'OFFLINE'}</span>
                  </div>
                  
                  <div className={`flex items-center gap-2 ${obsStatus.recording ? 'text-red-400' : 'opacity-60'}`}>
                    <div className={`w-2 h-2 rounded-full ${obsStatus.recording ? 'bg-red-500' : 'bg-gray-500'}`}></div>
                    <span className="text-sm">{obsStatus.recording ? 'REC' : 'IDLE'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Error Message */}
        {obsStatus?.error && (
          <div className="mt-4 p-3 bg-red-500/20 border border-red-500/40 rounded-lg">
            <div className="flex items-center gap-2">
              <svg className="icon-sm text-red-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <span className="text-sm text-red-300">{obsStatus.error}</span>
            </div>
          </div>
        )}

        {/* Version Info */}
        <div className="mt-6 pt-4 border-t border-white/20 flex justify-between items-center text-sm opacity-60">
          <div className="flex gap-4">
            {obsStatus?.version && (
              <>
                <span>OBS v{obsStatus.version.obsVersion}</span>
                <span>WebSocket v{obsStatus.version.obsWebSocketVersion}</span>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span>OBS Stream Manager</span>
          </div>
        </div>
      </div>
    </footer>
  );
}