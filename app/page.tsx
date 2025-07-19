'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Dropdown from '@/components/Dropdown';

type Stream = {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
};

type ScreenType = 'large' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

export default function Home() {
  const [streams, setStreams] = useState<Stream[]>([]);
  const [activeSources, setActiveSources] = useState<Record<ScreenType, string | null>>({
    large: null,
    left: null,
    right: null,
    topLeft: null,
    topRight: null,
    bottomLeft: null,
    bottomRight: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch streams and active sources in parallel
        const [streamsRes, activeRes] = await Promise.all([
          fetch('/api/streams'),
          fetch('/api/getActive')
        ]);
        
        const [streamsData, activeData] = await Promise.all([
          streamsRes.json(),
          activeRes.json()
        ]);
        
        setStreams(streamsData);
        setActiveSources(activeData);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSetActive = async (screen: ScreenType, id: number | null) => {
    const selectedStream = streams.find((stream) => stream.id === id);

    // Update local state immediately
    setActiveSources((prev) => ({
      ...prev,
      [screen]: selectedStream?.obs_source_name || null,
    }));

    // Update backend
    if (id) {
      try {
        const response = await fetch('/api/setActive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screen, id }),
        });

        if (!response.ok) {
          throw new Error('Failed to set active stream');
        }
      } catch (error) {
        console.error('Error setting active stream:', error);
        // Revert local state on error
        setActiveSources((prev) => ({
          ...prev,
          [screen]: null,
        }));
      }
    }
  };

  const handleToggleDropdown = (screen: string) => {
    setOpenDropdown((prev) => (prev === screen ? null : screen));
  };

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
        <h1 className="title">Stream Control Center</h1>
        <p className="subtitle">
          Manage your OBS sources across multiple screen positions
        </p>
      </div>

      {/* Main Screen */}
      <div className="glass p-6 mb-6">
        <h2 className="card-title">Primary Display</h2>
        <div className="max-w-md mx-auto">
          <Dropdown
            options={streams}
            activeId={
              streams.find((stream) => stream.obs_source_name === activeSources.large)?.id || null
            }
            onSelect={(id) => handleSetActive('large', id)}
            label="Select Primary Stream..."
            isOpen={openDropdown === 'large'}
            onToggle={() => handleToggleDropdown('large')}
          />
        </div>
      </div>

      {/* Side Displays */}
      <div className="glass p-6 mb-6">
        <h2 className="card-title">Side Displays</h2>
        <div className="grid-2">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">Left Display</h3>
            <Dropdown
              options={streams}
              activeId={
                streams.find((stream) => stream.obs_source_name === activeSources.left)?.id || null
              }
              onSelect={(id) => handleSetActive('left', id)}
              label="Select Left Stream..."
              isOpen={openDropdown === 'left'}
              onToggle={() => handleToggleDropdown('left')}
            />
          </div>
          <div>
            <h3 className="text-lg font-semibold mb-4 text-center">Right Display</h3>
            <Dropdown
              options={streams}
              activeId={
                streams.find((stream) => stream.obs_source_name === activeSources.right)?.id || null
              }
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
        <h2 className="card-title">Corner Displays</h2>
        <div className="grid-4">
          {[
            { screen: 'topLeft' as const, label: 'Top Left' },
            { screen: 'topRight' as const, label: 'Top Right' },
            { screen: 'bottomLeft' as const, label: 'Bottom Left' },
            { screen: 'bottomRight' as const, label: 'Bottom Right' },
          ].map(({ screen, label }) => (
            <div key={screen}>
              <h3 className="text-md font-semibold mb-3 text-center">{label}</h3>
              <Dropdown
                options={streams}
                activeId={
                  streams.find((stream) => stream.obs_source_name === activeSources[screen])?.id || null
                }
                onSelect={(id) => handleSetActive(screen, id)}
                label="Select Stream..."
                isOpen={openDropdown === screen}
                onToggle={() => handleToggleDropdown(screen)}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Manage Streams Section */}
      {streams.length > 0 && (
        <div className="glass p-6 mt-6">
          <h2 className="card-title">Manage Streams</h2>
          <div className="grid gap-4">
            {streams.map((stream) => (
              <div key={stream.id} className="glass p-4 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">{stream.name}</h3>
                  <p className="text-sm text-white/60">{stream.obs_source_name}</p>
                </div>
                <Link
                  href={`/edit/${stream.id}`}
                  className="btn-secondary btn-sm"
                >
                  <span className="icon">✏️</span>
                  Edit
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}