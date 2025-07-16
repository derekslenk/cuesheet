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

export default function Home() {
  const [streams, setStreams] = useState<Stream[]>([]);
type ScreenType = 'large' | 'left' | 'right' | 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';

const [activeSources, setActiveSources] = useState<Record<ScreenType, string | null>>({
large: null,
left: null,
right: null,
topLeft: null,
topRight: null,
bottomLeft: null,
bottomRight: null,
});

  const [isLoadingStreams, setIsLoadingStreams] = useState(true);
  const [isLoadingActiveSources, setIsLoadingActiveSources] = useState(true);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null); // Manage open dropdown

  useEffect(() => {
    // Fetch available streams from the database
    async function fetchStreams() {
      setIsLoadingStreams(true);
      try {
        const res = await fetch('/api/streams');
        const data = await res.json();
        setStreams(data);
      } catch (error) {
        console.error('Error fetching streams:', error);
      } finally {
        setIsLoadingStreams(false);
      }
    }

    // Fetch current active sources from files
    async function fetchActiveSources() {
      setIsLoadingActiveSources(true);
      try {
        const res = await fetch('/api/getActive');
        const data = await res.json();
        console.log('Fetched activeSources:', data); // Debug log
        setActiveSources(data);
      } catch (error) {
        console.error('Error fetching active sources:', error);
      } finally {
        setIsLoadingActiveSources(false);
      }
    }

    fetchStreams();
    fetchActiveSources();
  }, []);

const handleSetActive = async (screen: ScreenType, id: number | null) => {
    const selectedStream = streams.find((stream) => stream.id === id);

    // Update local state
    setActiveSources((prev) => ({
      ...prev,
      [screen]: selectedStream?.obs_source_name || null,
    }));

    // Update the backend
    try {
      if (id) {
        console.log('Setting screen ', screen);
        const response = await fetch('/api/setActive', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ screen, id }),
        });

        if (!response.ok) {
          throw new Error('Failed to set active stream');
        }

        const data = await response.json();
        console.log(data.message);
      }
    } catch (error) {
      console.error('Error setting active stream:', error);
    }
  };

  const handleToggleDropdown = (screen: string) => {
    setOpenDropdown((prev) => (prev === screen ? null : screen)); // Toggle dropdown open/close
  };

  return (
    <div>
      {/* Navigation Links */}
      <div className="text-center mb-5 space-x-4">
        <Link
          href="/add"
          className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
        >
          Add New Stream
        </Link>
        <span className="text-gray-400">|</span>
        <Link
          href="/teams"
          className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
        >
          Manage Teams
        </Link>
      </div>

      <div className="text-center mb-5">
        <h1 className="text-2xl font-bold">Manage Streams</h1>
      </div>

      {/* Display loading indicator if either streams or active sources are loading */}
      {isLoadingStreams || isLoadingActiveSources ? (
        <div className="text-center text-gray-500">Loading...</div>
      ) : (
        <>
          {/* Large Screen on its own line */}
          <div className="flex justify-center p-5">
            <div className="text-center border border-gray-400 p-4 rounded-lg shadow w-full max-w-md">
              <h2 className="text-lg font-semibold mb-2">Large</h2>
              <Dropdown
                options={streams}
                activeId={
                  streams.find((stream) => stream.obs_source_name === activeSources.large)?.id || null
                }
                onSelect={(id) => handleSetActive('large', id)}
                label="Select a Stream..."
                isOpen={openDropdown === 'large'}
                onToggle={() => handleToggleDropdown('large')}
              />
            </div>
          </div>

          {/* Row for Left and Right Screens */}
          <div className="flex justify-around p-5">
            {/* Left Screen */}
            <div className="flex-1 text-center border border-gray-400 p-4 rounded-lg shadow mx-2">
              <h2 className="text-lg font-semibold mb-2">Left</h2>
              <Dropdown
                options={streams}
                activeId={
                  streams.find((stream) => stream.obs_source_name === activeSources.left)?.id || null
                }
                onSelect={(id) => handleSetActive('left', id)}
                label="Select a Stream..."
                isOpen={openDropdown === 'left'}
                onToggle={() => handleToggleDropdown('left')}
              />
            </div>

            {/* Right Screen */}
            <div className="flex-1 text-center border border-gray-400 p-4 rounded-lg shadow mx-2">
              <h2 className="text-lg font-semibold mb-2">Right</h2>
              <Dropdown
                options={streams}
                activeId={
                  streams.find((stream) => stream.obs_source_name === activeSources.right)?.id || null
                }
                onSelect={(id) => handleSetActive('right', id)}
                label="Select a Stream..."
                isOpen={openDropdown === 'right'}
                onToggle={() => handleToggleDropdown('right')}
              />
            </div>
          </div>

          {/* 2x2 Square for Additional Sources */}
          <div className="grid grid-cols-2 gap-4 p-5">
            {[
            { screen: 'topLeft' as const, label: 'Top Left' },
            { screen: 'topRight' as const, label: 'Top Right' },
            { screen: 'bottomLeft' as const, label: 'Bottom Left' },
            { screen: 'bottomRight' as const, label: 'Bottom Right' },
            ].map(({ screen, label }) => (
              <div key={screen} className="text-center border border-gray-400 p-4 rounded-lg shadow">
                <h2 className="text-lg font-semibold mb-2">{label}</h2>
                <Dropdown
                  options={streams}
                  activeId={
                    streams.find((stream) => stream.obs_source_name === activeSources[screen])?.id ||
                    null
                  }
                  onSelect={(id) => handleSetActive(screen, id)}
                  label="Select a Stream..."
                  isOpen={openDropdown === screen}
                  onToggle={() => handleToggleDropdown(screen)}
                />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
