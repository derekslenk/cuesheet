'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Dropdown from '@/components/Dropdown';
import { Team } from '@/types';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

type Stream = {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
  team_id: number | null;
};

const ROLE_OPTIONS = ['Key Courier', 'Tank', 'Healer', 'DPS', 'Standby'];

export default function EditStream() {
  const params = useParams();
  const router = useRouter();
  const streamId = params.id as string;
  
  const [formData, setFormData] = useState<{
    name: string;
    obs_source_name: string;
    url: string;
    team_id: number | null;
    role: string;
  }>({
    name: '',
    obs_source_name: '',
    url: '',
    team_id: null,
    role: '',
  });
  
  const [teams, setTeams] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [stream, setStream] = useState<Stream | null>(null);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const { toasts, removeToast, showSuccess, showError } = useToast();

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
          role: streamData.role ?? '',
        });
        
        const teams = teamsData.data;
        
        // Map teams for dropdown
        setTeams(
          teams.map((team: Team) => ({
            id: team.team_id,
            name: team.team_name,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch data:', error);
        showError('Failed to Load Stream', 'Could not fetch stream data. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };
    
    if (streamId) {
      fetchData();
    }
  }, [streamId, showError]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear validation error when user starts typing
    if (validationErrors[name]) {
      setValidationErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleTeamSelect = (teamId: number) => {
    setFormData((prev) => ({ ...prev, team_id: teamId }));
    
    // Clear validation error when user selects team
    if (validationErrors.team_id) {
      setValidationErrors(prev => ({ ...prev, team_id: '' }));
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
    
    if (!formData.obs_source_name.trim()) {
      errors.obs_source_name = 'OBS source name is required';
    }
    
    if (!formData.url.trim()) {
      errors.url = 'Stream URL is required';
    } else {
      try {
        new URL(formData.url);
      } catch {
        errors.url = 'Please enter a valid URL';
      }
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
      const response = await fetch(`/api/streams/${streamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (response.ok) {
        showSuccess('Stream Updated', `"${formData.name}" has been updated successfully`);
        // Redirect back to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        showError('Failed to Update Stream', data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error updating stream:', error);
      showError('Failed to Update Stream', 'Network error or server unavailable');
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
        showSuccess('Stream Deleted', `"${stream?.name || 'Stream'}" has been deleted successfully`);
        // Redirect back to home after a short delay
        setTimeout(() => {
          router.push('/');
        }, 1500);
      } else {
        showError('Failed to Delete Stream', data.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error deleting stream:', error);
      showError('Failed to Delete Stream', 'Network error or server unavailable');
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
            <span className="icon">🏠</span>
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

            {/* Role (shown on the stream label) */}
            <div>
              <label className="block text-white font-semibold mb-3">
                Role <span className="text-white/50 font-normal">(optional — shown on the label)</span>
              </label>
              <select
                name="role"
                value={formData.role}
                onChange={(e) => setFormData((prev) => ({ ...prev, role: e.target.value }))}
                className="input"
              >
                <option value="">— None —</option>
                {(formData.role && !ROLE_OPTIONS.includes(formData.role)
                  ? [formData.role, ...ROLE_OPTIONS]
                  : ROLE_OPTIONS
                ).map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 space-y-4">
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-success w-full"
              >
                <span className="icon">✅</span>
                {isSubmitting ? 'Updating Stream...' : 'Update Stream'}
              </button>
              
              <div className="button-group" style={{ justifyContent: 'center' }}>
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="btn-secondary"
                >
                  <span className="icon">❌</span>
                  Cancel
                </button>
                
                <button
                  type="button"
                  onClick={handleDelete}
                  className="btn-danger"
                >
                  <span className="icon">🗑️</span>
                  Delete Stream
                </button>
              </div>
            </div>
          </form>

        </div>
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}