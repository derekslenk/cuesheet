'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Dropdown from '@/components/Dropdown';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';
import { useActiveSourceLookup, useDebounce, PerformanceMonitor } from '@/lib/performance';
import { SCREEN_POSITIONS } from '@/lib/constants';

import { StreamWithTeam } from '@/types';

type ScreenType = typeof SCREEN_POSITIONS[number];

export default function Home() {
  const [streams, setStreams] = useState<StreamWithTeam[]>([]);
  const [activeSources, setActiveSources] = useState<Record<ScreenType, string | null>>(
    Object.fromEntries(SCREEN_POSITIONS.map(screen => [screen, null])) as Record<ScreenType, string | null>
  );
  const [isLoading, setIsLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [currentScene, setCurrentScene] = useState<string | null>(null);
  const { toasts, removeToast, showSuccess, showError } = useToast();

  // Memoized active source lookup for performance
  const activeSourceIds = useActiveSourceLookup(streams, activeSources);

  // Debounced API calls to prevent excessive requests
  const setActiveFunction = useCallback(async (screen: ScreenType, id: number | null) => {
    if (id) {
      const selectedStream = streams.find(stream => stream.id === id);
      try {
        const endTimer = PerformanceMonitor.startTimer('setActive_api');
        const response = await fetch('/api/setActive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screen, id }),
        });
        endTimer();

        if (!response.ok) {
          throw new Error('Failed to set active stream');
        }
        
        showSuccess('Source Updated', `Set ${selectedStream?.name || 'stream'} as active for ${screen}`);
      } catch (error) {
        console.error('Error setting active stream:', error);
        showError('Failed to Update Source', 'Could not set active stream. Please try again.');
        // Revert local state on error
        setActiveSources((prev) => ({
          ...prev,
          [screen]: null,
        }));
      }
    }
  }, [streams, showError, showSuccess]);

  const debouncedSetActive = useDebounce(setActiveFunction, 300);

  const fetchData = useCallback(async () => {
    const endTimer = PerformanceMonitor.startTimer('fetchData');
    try {
      // Fetch streams, active sources, and current scene in parallel
      const [streamsRes, activeRes, sceneRes] = await Promise.all([
        fetch('/api/streams'),
        fetch('/api/getActive'),
        fetch('/api/getCurrentScene')
      ]);
      
      const [streamsData, activeData, sceneData] = await Promise.all([
        streamsRes.json(),
        activeRes.json(),
        sceneRes.json()
      ]);
      
      // Handle both old and new API response formats
      const streams = streamsData.success ? streamsData.data : streamsData;
      const activeSources = activeData.success ? activeData.data : activeData;
      const sceneName = sceneData.success ? sceneData.data.sceneName : null;
      
      setStreams(streams);
      setActiveSources(activeSources);
      setCurrentScene(sceneName);
    } catch (error) {
      console.error('Error fetching data:', error);
      showError('Failed to Load Data', 'Could not fetch streams. Please refresh the page.');
    } finally {
      setIsLoading(false);
      endTimer();
    }
  }, [showError]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSetActive = useCallback(async (screen: ScreenType, id: number | null) => {
    const selectedStream = streams.find((stream) => stream.id === id);

    // Generate stream group name for optimistic updates - must match obsClient.js format
    const streamGroupName = selectedStream 
      ? `${selectedStream.team_name?.toLowerCase().replace(/\s+/g, '_') || 'unknown'}_${selectedStream.name.toLowerCase().replace(/\s+/g, '_')}_stream`
      : null;

    // Update local state immediately for optimistic updates
    setActiveSources((prev) => ({
      ...prev,
      [screen]: streamGroupName,
    }));

    // Debounced backend update
    debouncedSetActive(screen, id);
  }, [streams, debouncedSetActive]);

  const handleToggleDropdown = useCallback((screen: string) => {
    setOpenDropdown((prev) => (prev === screen ? null : screen));
  }, []);

  const handleSceneSwitch = useCallback(async (sceneName: string) => {
    try {
      const response = await fetch('/api/setScene', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sceneName }),
      });

      const result = await response.json();

      if (result.success) {
        // Update local state immediately for responsive UI
        setCurrentScene(sceneName);
        showSuccess('Scene Changed', `Switched to ${sceneName} layout`);
      } else {
        throw new Error(result.error || 'Failed to switch scene');
      }
    } catch (error) {
      console.error('Error switching scene:', error);
      showError('Scene Switch Failed', error instanceof Error ? error.message : 'Could not switch scene. Please try again.');
    }
  }, [showSuccess, showError]);

  // Memoized corner displays to prevent re-renders
  const cornerDisplays = useMemo(() => [
    { screen: 'top_left' as const, label: 'Top Left' },
    { screen: 'top_right' as const, label: 'Top Right' },
    { screen: 'bottom_left' as const, label: 'Bottom Left' },
    { screen: 'bottom_right' as const, label: 'Bottom Right' },
  ], []);

  // Transform and sort streams for dropdown display
  const dropdownStreams = useMemo(() => {
    return streams
      .map(stream => ({
        id: stream.id,
        name: `${stream.team_name} - ${stream.name}`,
        originalStream: stream
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [streams]);

  if (isLoading) {
    return (
      <div className="container section">
        <div className="glass p-8 text-center">
          <div className="mb-4">Loading streams...</div>
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="title">Live Stream Control Center</h1>
        <p className="subtitle">
          Manage your OBS sources across multiple screen positions
        </p>
      </div>

      {/* Main Screen */}
      <div className="glass p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title mb-0">Primary Display</h2>
          <button
            onClick={() => handleSceneSwitch('1-Screen')}
            className={`btn ${currentScene === '1-Screen' ? 'active' : ''}`}
            style={{
              background: currentScene === '1-Screen' 
                ? 'linear-gradient(135deg, var(--solarized-green), var(--solarized-yellow))'
                : 'linear-gradient(135deg, var(--solarized-blue), var(--solarized-cyan))'
            }}
          >
            {currentScene === '1-Screen' ? 'Active: 1-Screen' : 'Switch to 1-Screen'}
          </button>
        </div>
        <div className="max-w-md mx-auto">
          <Dropdown
            options={dropdownStreams}
            activeId={activeSourceIds.large}
            onSelect={(id) => handleSetActive('large', id)}
            label="Select Primary Stream..."
            isOpen={openDropdown === 'large'}
            onToggle={() => handleToggleDropdown('large')}
          />
        </div>
      </div>

      {/* Side Displays */}
      <div className="glass p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title mb-0">Side Displays</h2>
          <button
            onClick={() => handleSceneSwitch('2-Screen')}
            className={`btn ${currentScene === '2-Screen' ? 'active' : ''}`}
            style={{
              background: currentScene === '2-Screen' 
                ? 'linear-gradient(135deg, var(--solarized-green), var(--solarized-yellow))'
                : 'linear-gradient(135deg, var(--solarized-blue), var(--solarized-cyan))'
            }}
          >
            {currentScene === '2-Screen' ? 'Active: 2-Screen' : 'Switch to 2-Screen'}
          </button>
        </div>
        <div className="grid-2">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">Left Display</h3>
            <Dropdown
              options={dropdownStreams}
              activeId={activeSourceIds.left}
              onSelect={(id) => handleSetActive('left', id)}
              label="Select Left Stream..."
              isOpen={openDropdown === 'left'}
              onToggle={() => handleToggleDropdown('left')}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">Right Display</h3>
            <Dropdown
              options={dropdownStreams}
              activeId={activeSourceIds.right}
              onSelect={(id) => handleSetActive('right', id)}
              label="Select Right Stream..."
              isOpen={openDropdown === 'right'}
              onToggle={() => handleToggleDropdown('right')}
            />
          </div>
        </div>
      </div>

      {/* Corner Displays */}
      <div className="glass p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title mb-0">Corner Displays</h2>
          <button
            onClick={() => handleSceneSwitch('4-Screen')}
            className={`btn ${currentScene === '4-Screen' ? 'active' : ''}`}
            style={{
              background: currentScene === '4-Screen' 
                ? 'linear-gradient(135deg, var(--solarized-green), var(--solarized-yellow))'
                : 'linear-gradient(135deg, var(--solarized-blue), var(--solarized-cyan))'
            }}
          >
            {currentScene === '4-Screen' ? 'Active: 4-Screen' : 'Switch to 4-Screen'}
          </button>
        </div>
        <div className="grid-4">
          {cornerDisplays.map(({ screen, label }) => (
            <div key={screen}>
              <h3 className="text-md font-semibold mb-3 text-center">{label}</h3>
              <Dropdown
                options={dropdownStreams}
                activeId={activeSourceIds[screen]}
                onSelect={(id) => handleSetActive(screen, id)}
                label="Select Stream..."
                isOpen={openDropdown === screen}
                onToggle={() => handleToggleDropdown(screen)}
              />
            </div>
          ))}
        </div>
      </div>

      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}