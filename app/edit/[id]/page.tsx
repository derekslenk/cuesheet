'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Dropdown from '@/components/Dropdown';
import { Team } from '@/types';

type Stream = {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
  team_id: number | null;
};

export default function EditStream() {
  const params = useParams();
  const router = useRouter();
  const streamId = params.id as string;
  
  const [formData, setFormData] = useState<{
    name: string;
    obs_source_name: string;
    url: string;
    team_id: number | null;
  }>({
    name: '',
    obs_source_name: '',
    url: '',
    team_id: null,
  });
  
  const [teams, setTeams] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stream, setStream] = useState<Stream | null>(null);

  // Fetch stream data and teams
  useEffect(() => {
    const fetchData = async () => {
      try {
        const [streamRes, teamsRes] = await Promise.all([
          fetch(`/api/streams/${streamId}`),
          fetch('/api/teams')
        ]);
        
        if (!streamRes.ok) {
          throw new Error('Stream not found');
        }
        
        const [streamData, teamsData] = await Promise.all([
          streamRes.json(),
          teamsRes.json()
        ]);
        
        setStream(streamData);
        setFormData({
          name: streamData.name,
          obs_source_name: streamData.obs_source_name,
          url: streamData.url,
          team_id: streamData.team_id,
        });
        
        // Map teams for dropdown
        setTeams(
          teamsData.map((team: Team) => ({
            id: team.team_id,
            name: team.team_name,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch data:', error);
        setMessage('Failed to load stream data');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (streamId) {
      fetchData();
    }
  }, [streamId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamSelect = (teamId: number) => {
    setFormData((prev) => ({ ...prev, team_id: teamId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/streams/${streamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        setMessage('Stream updated successfully!');
        // Redirect back to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        setMessage(data.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error('Error updating stream:', error);
      setMessage('Failed to update stream.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this stream? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/streams/${streamId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (response.ok) {
        setMessage('Stream deleted successfully!');
        // Redirect back to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        setMessage(data.error || 'Failed to delete stream.');
      }
    } catch (error) {
      console.error('Error deleting stream:', error);
      setMessage('Failed to delete stream.');
    }
  };

  if (isLoading) {
    return (
      <div className="container section">
        <div className="glass p-8 text-center">
          <div className="mb-4">Loading stream data...</div>
          <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto"></div>
        </div>
      </div>
    );
  }

  if (!stream) {
    return (
      <div className="container section">
        <div className="glass p-8 text-center">
          <h1 className="title">Stream Not Found</h1>
          <p className="subtitle">The requested stream could not be found.</p>
          <button onClick={() => router.push('/')} className="btn mt-4">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container section">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="title">Edit Stream</h1>
        <p className="subtitle">
          Update the details for &quot;{stream.name}&quot;
        </p>
      </div>

      {/* Form */}
      <div className="max-w-2xl mx-auto">
        <div className="glass p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
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

            {/* Action Buttons */}
            <div className="pt-6 space-y-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn w-full"
              >
                <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
                {isSubmitting ? 'Updating Stream...' : 'Update Stream'}
              </button>
              
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="btn-secondary flex-1"
                >
                  Cancel
                </button>
                
                <button
                  type="button"
                  onClick={handleDelete}
                  className="btn bg-red-600 hover:bg-red-700 flex-1"
                >
                  <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                  </svg>
                  Delete Stream
                </button>
              </div>
            </div>
          </form>

          {/* Success/Error Message */}
          {message && (
            <div className={`mt-6 p-4 rounded-lg border ${
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
          )}
        </div>
      </div>
    </div>
  );
}