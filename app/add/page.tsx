'use client';

import { useState, useEffect } from 'react';
import Dropdown from '@/components/Dropdown';
import { Team } from '@/types';

interface Stream {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
  team_id: number;
}

export default function AddStream() {
  const [formData, setFormData] = useState({
    name: '',
    obs_source_name: '',
    url: '',
    team_id: null,
  });
  const [teams, setTeams] = useState([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch teams and streams on component mount
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [teamsResponse, streamsResponse] = await Promise.all([
        fetch('/api/teams'),
        fetch('/api/streams')
      ]);
      
      const teamsData = await teamsResponse.json();
      const streamsData = await streamsResponse.json();

      // Map the API data to the format required by the Dropdown
      setTeams(
        teamsData.map((team: Team) => ({
          id: team.team_id,
          name: team.team_name,
        }))
      );
      
      setStreams(streamsData);
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamSelect = (teamId: number) => {
    // @ts-expect-error - team_id can be null or number in formData, but TypeScript expects only number
    setFormData((prev) => ({ ...prev, team_id: teamId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch('/api/addStream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage(data.message);
        setFormData({ name: '', obs_source_name: '', url: '', team_id: null }); // Reset form
        fetchData(); // Refresh the streams list
      } else {
        setMessage(data.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error('Error adding stream:', error);
      setMessage('Failed to add stream.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container section">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="title">Streams</h1>
        <p className="subtitle">
          Organize your content by creating and managing stream sources
        </p>
      </div>

      {/* Add New Stream */}
      <div className="glass p-6 mb-6">
        <h2 className="card-title">Add Stream</h2>
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-6">
          {/* Stream Name */}
          <div>
            <label className="block text-white font-semibold mb-3">
              Stream Name
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              className="input"
              placeholder="Enter a display name for the stream"
            />
          </div>

          {/* OBS Source Name */}
          <div>
            <label className="block text-white font-semibold mb-3">
              OBS Source Name
            </label>
            <input
              type="text"
              name="obs_source_name"
              value={formData.obs_source_name}
              onChange={handleInputChange}
              required
              className="input"
              placeholder="Enter the exact source name from OBS"
            />
          </div>

          {/* URL */}
          <div>
            <label className="block text-white font-semibold mb-3">
              Stream URL
            </label>
            <input
              type="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              required
              className="input"
              placeholder="https://example.com/stream"
            />
          </div>

          {/* Team Selection */}
          <div>
            <label className="block text-white font-semibold mb-3">
              Team
            </label>
            <Dropdown
              options={teams}
              activeId={formData.team_id}
              onSelect={handleTeamSelect}
              label="Select a Team"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-6">
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn w-full"
            >
              <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              {isSubmitting ? 'Adding Stream...' : 'Add Stream'}
            </button>
          </div>
        </form>
      </div>

      {/* Success/Error Message */}
      {message && (
        <div className="glass p-6 mb-6">
          <div className={`p-4 rounded-lg border ${
            message.includes('successfully') 
              ? 'bg-green-500/20 text-green-300 border-green-500/40' 
              : 'bg-red-500/20 text-red-300 border-red-500/40'
          }`}>
            <div className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                message.includes('successfully') ? 'bg-green-500' : 'bg-red-500'
              }`}>
                {message.includes('successfully') ? (
                  <svg className="icon-sm text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                ) : (
                  <svg className="icon-sm text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <span className="font-medium">{message}</span>
            </div>
          </div>
        </div>
      )}

      {/* Streams List */}
      <div className="glass p-6">
        <h2 className="card-title">Existing Streams</h2>
        
        {isLoading ? (
          <div className="text-center p-8">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-white/60">Loading streams...</div>
          </div>
        ) : streams.length === 0 ? (
          <div className="text-center p-8">
            <svg className="icon-lg mx-auto mb-4 text-white/40" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6zM14.553 7.106A1 1 0 0014 8v4a1 1 0 00.553.894l2 1A1 1 0 0018 13V7a1 1 0 00-1.447-.894l-2 1z" />
            </svg>
            <div className="text-white/60">No streams found</div>
            <div className="text-white/40 text-sm">Create your first stream above!</div>
          </div>
        ) : (
          <div className="space-y-4">
            {streams.map((stream) => {
              const team = teams.find(t => t.id === stream.team_id);
              return (
                <div key={stream.id} className="glass p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {stream.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{stream.name}</div>
                        <div className="text-sm text-white/60">OBS: {stream.obs_source_name}</div>
                        <div className="text-sm text-white/60">Team: {team?.name || 'Unknown'}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-white/40">ID: {stream.id}</div>
                      <a href={stream.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-400 hover:text-blue-300">
                        View Stream
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}