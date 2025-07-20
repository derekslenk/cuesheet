'use client';

import { useState, useEffect, useCallback } from 'react';
import Dropdown from '@/components/Dropdown';
import { Team } from '@/types';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

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
    twitch_username: '',
    team_id: null,
  });
  const [teams, setTeams] = useState<{id: number; name: string}[]>([]);
  const [streams, setStreams] = useState<Stream[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const [deleteConfirm, setDeleteConfirm] = useState<{id: number; name: string} | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toasts, removeToast, showSuccess, showError } = useToast();

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [teamsResponse, streamsResponse] = await Promise.all([
        fetch('/api/teams'),
        fetch('/api/streams')
      ]);
      
      const teamsData = await teamsResponse.json();
      const streamsData = await streamsResponse.json();

      // Handle both old and new API response formats
      const teams = teamsData.success ? teamsData.data : teamsData;
      const streams = streamsData.success ? streamsData.data : streamsData;

      // Map the API data to the format required by the Dropdown
      setTeams(
        teams.map((team: Team) => ({
          id: team.team_id,
          name: team.team_name,
        }))
      );
      
      setStreams(streams);
    } catch (error) {
      console.error('Failed to fetch data:', error);
      showError('Failed to Load Data', 'Could not fetch teams and streams. Please refresh the page.');
    } finally {
      setIsLoading(false);
    }
  }, [showError]);

  // Fetch teams and streams on component mount
  useEffect(() => {
    fetchData();
  }, [fetchData]);


  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleTeamSelect = (teamId: number) => {
    // @ts-expect-error - team_id can be null or number in formData, but TypeScript expects only number
    setFormData((prev) => ({ ...prev, team_id: teamId }));
    
    // Clear validation error when user selects team
    if (validationErrors.team_id) {
      setValidationErrors(prev => ({ ...prev, team_id: '' }));
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/streams/${deleteConfirm.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      if (response.ok) {
        showSuccess('Stream Deleted', `"${deleteConfirm.name}" has been deleted successfully`);
        setDeleteConfirm(null);
        // Refetch the streams list
        await fetchData();
      } else {
        showError('Failed to Delete Stream', data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error deleting stream:', error);
      showError('Failed to Delete Stream', 'Network error or server unavailable');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    const errors: {[key: string]: string} = {};
    if (!formData.name.trim()) {
      errors.name = 'Stream name is required';
    } else if (formData.name.trim().length < 2) {
      errors.name = 'Stream name must be at least 2 characters';
    }
    
    
    if (!formData.twitch_username.trim()) {
      errors.twitch_username = 'Twitch username is required';
    } else if (!/^[a-zA-Z0-9_]{4,25}$/.test(formData.twitch_username.trim())) {
      errors.twitch_username = 'Twitch username must be 4-25 characters and contain only letters, numbers, and underscores';
    }
    
    if (!formData.team_id) {
      errors.team_id = 'Please select a team';
    }
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Validation Error', 'Please fix the form errors');
      return;
    }
    
    setIsSubmitting(true);

    try {
      const submissionData = {
        ...formData,
        url: `https://www.twitch.tv/${formData.twitch_username.trim()}`
      };
      
      const response = await fetch('/api/addStream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submissionData),
      });

      const data = await response.json();
      if (response.ok) {
        showSuccess('Stream Added', `"${formData.name}" has been added successfully`);
        setFormData({ name: '', twitch_username: '', team_id: null });
        setValidationErrors({});
        fetchData();
      } else {
        showError('Failed to Add Stream', data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error adding stream:', error);
      showError('Failed to Add Stream', 'Network error or server unavailable');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
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
              className={`input ${
                validationErrors.name ? 'border-red-500/60 bg-red-500/10' : ''
              }`}
              placeholder="Enter a display name for the stream"
            />
            {validationErrors.name && (
              <div className="text-red-400 text-sm mt-2">
                {validationErrors.name}
              </div>
            )}
          </div>


          {/* Twitch Username */}
          <div>
            <label className="block text-white font-semibold mb-3">
              Twitch Username
            </label>
            <input
              type="text"
              name="twitch_username"
              value={formData.twitch_username}
              onChange={handleInputChange}
              required
              className={`input ${
                validationErrors.twitch_username ? 'border-red-500/60 bg-red-500/10' : ''
              }`}
              placeholder="Enter Twitch username"
            />
            {validationErrors.twitch_username && (
              <div className="text-red-400 text-sm mt-2">
                {validationErrors.twitch_username}
              </div>
            )}
          </div>

          {/* Team Selection and Submit Button */}
          <div>
            <label className="block text-white font-semibold mb-3">
              Team
            </label>
            <div className="form-row">
              <div style={{ flex: 1, position: 'relative', zIndex: 10000 }}>
                <Dropdown
                  options={teams}
                  activeId={formData.team_id}
                  onSelect={handleTeamSelect}
                  label="Select a Team"
                />
                {validationErrors.team_id && (
                  <div className="text-red-400 text-sm mt-2">
                    {validationErrors.team_id}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-success"
              >
                <span className="icon">🎥</span>
                {isSubmitting ? 'Adding...' : 'Add Stream'}
              </button>
            </div>
          </div>
        </form>
      </div>


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
                    <div className="flex items-center">
                      <div 
                        className="bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0" 
                        style={{ 
                          width: '64px', 
                          height: '64px', 
                          fontSize: '24px', 
                          marginRight: '16px' 
                        }}
                      >
                        {stream.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-white">{stream.name}</div>
                        <div className="text-sm text-white/60">OBS: {stream.obs_source_name}</div>
                        <div className="text-sm text-white/60">Team: {team?.name || 'Unknown'}</div>
                      </div>
                    </div>
                    <div className="text-right space-y-2">
                      <div className="text-sm text-white/40">ID: {stream.id}</div>
                      <div className="flex justify-end">
                        <a 
                          href={stream.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="btn btn-primary text-sm"
                          style={{ marginRight: '8px' }}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Stream
                        </a>
                        <button
                          onClick={() => setDeleteConfirm({ id: stream.id, name: stream.name })}
                          className="btn btn-danger text-sm"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      
        {/* Toast Notifications */}
        <ToastContainer toasts={toasts} onRemove={removeToast} />
      </div>
      
      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <div className="glass p-6" style={{ maxWidth: '28rem', width: '90%' }}>
            <h3 className="text-xl font-bold text-white mb-4">Confirm Deletion</h3>
            <p className="text-white/80 mb-6">
              Are you sure you want to delete the stream &ldquo;{deleteConfirm.name}&rdquo;? This will remove it from both the database and OBS.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="btn btn-danger"
              >
                {isDeleting ? 'Deleting...' : 'Delete Stream'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}