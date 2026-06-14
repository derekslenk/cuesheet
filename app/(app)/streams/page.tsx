'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Dropdown from '@/components/Dropdown';
import CollapsibleGroup from '@/components/CollapsibleGroup';
import StreamPreview from '@/components/StreamPreview';
import { Team } from '@/types';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

interface Stream {
  id: number;
  name: string;
  obs_source_name: string;
  url: string;
  team_id: number;
  disabled?: number;
}

// Derived per-stream lifecycle state shown on the control buttons.
// 'running' / 'escalated' come from the supervisor health snapshot; 'stopped'
// means not supervised (operator-stopped); 'unknown' means the supervisor is
// unreachable and we fall back to the DB `disabled` flag.
type StreamControlStatus = 'running' | 'escalated' | 'stopped' | 'unknown';

interface StreamsByTeamProps {
  streams: Stream[];
  teams: {id: number; name: string}[];
  onDelete: (stream: Stream) => void;
  onStart: (stream: Stream) => void;
  onStop: (stream: Stream) => void;
  onRestart: (stream: Stream) => void;
  statusBySource: Map<string, string>;
  supervisorReachable: boolean;
  pendingActions: Set<number>;
}

// Each state carries a non-color glyph cue (●/▲/■/?) alongside the label so the
// status is distinguishable without relying on hue — WCAG 1.4.1, matching the
// `.status-dot` shape-cue approach in globals.css.
const STATUS_BADGE: Record<StreamControlStatus, { label: string; symbol: string; className: string }> = {
  running: { label: 'Running', symbol: '●', className: 'bg-green-500/20 text-green-300' },
  escalated: { label: 'Crashed', symbol: '▲', className: 'bg-red-500/20 text-red-300' },
  stopped: { label: 'Stopped', symbol: '■', className: 'bg-white/10 text-white/50' },
  unknown: { label: 'Unknown', symbol: '?', className: 'bg-yellow-500/20 text-yellow-300' },
};

function StreamsByTeam({
  streams,
  teams,
  onDelete,
  onStart,
  onStop,
  onRestart,
  statusBySource,
  supervisorReachable,
  pendingActions,
}: StreamsByTeamProps) {
  // Map a stream to its control status. When the supervisor is unreachable we
  // can't know live state, so we report the DB intent (disabled → stopped) or
  // 'unknown' otherwise. When reachable, absence from the snapshot means the
  // stream isn't supervised, i.e. operator-stopped.
  const statusOf = (stream: Stream): StreamControlStatus => {
    if (!supervisorReachable) {
      return stream.disabled ? 'stopped' : 'unknown';
    }
    const live = statusBySource.get(stream.obs_source_name);
    if (live === 'escalated') return 'escalated';
    if (live) return 'running';
    return 'stopped';
  };
  const [expandedGroups, setExpandedGroups] = useState<Set<number>>(new Set());
  const [useCustomExpanded, setUseCustomExpanded] = useState(false);
  const [previewing, setPreviewing] = useState<Set<number>>(new Set());

  const togglePreview = (streamId: number) => {
    setPreviewing(prev => {
      const next = new Set(prev);
      if (next.has(streamId)) next.delete(streamId);
      else next.add(streamId);
      return next;
    });
  };

  // Group streams by team
  const streamsByTeam = useMemo(() => {
    const grouped = new Map<number, Stream[]>();
    
    // Initialize with all teams
    teams.forEach(team => {
      grouped.set(team.id, []);
    });
    
    // Add "No Team" group for streams without a team
    grouped.set(-1, []);
    
    // Group streams
    streams.forEach(stream => {
      const teamId = stream.team_id || -1;
      const teamStreams = grouped.get(teamId) || [];
      teamStreams.push(stream);
      grouped.set(teamId, teamStreams);
    });
    
    // Only include groups that have streams
    const result: Array<{teamId: number; teamName: string; streams: Stream[]}> = [];
    
    grouped.forEach((streamList, teamId) => {
      if (streamList.length > 0) {
        const team = teams.find(t => t.id === teamId);
        result.push({
          teamId,
          teamName: teamId === -1 ? 'No Team' : (team?.name || 'Unknown Team'),
          streams: streamList
        });
      }
    });
    
    // Sort by team name, with "No Team" at the end
    result.sort((a, b) => {
      if (a.teamId === -1) return 1;
      if (b.teamId === -1) return -1;
      return a.teamName.localeCompare(b.teamName);
    });
    
    return result;
  }, [streams, teams]);

  const handleExpandAll = () => {
    const allIds = streamsByTeam.map(group => group.teamId);
    setExpandedGroups(new Set(allIds));
    setUseCustomExpanded(true);
  };

  const handleCollapseAll = () => {
    setExpandedGroups(new Set());
    setUseCustomExpanded(true);
  };

  const handleToggleGroup = (teamId: number) => {
    const newExpanded = new Set(expandedGroups);
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId);
    } else {
      newExpanded.add(teamId);
    }
    setExpandedGroups(newExpanded);
    setUseCustomExpanded(true);
  };

  return (
    <div>
      {streamsByTeam.length > 0 && (
        <div className="flex justify-end gap-2 mb-4">
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleExpandAll}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            Expand All
          </button>
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleCollapseAll}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
            </svg>
            Collapse All
          </button>
        </div>
      )}
      <div className="space-y-4">
        {streamsByTeam.map(({ teamId, teamName, streams: teamStreams }) => (
          <CollapsibleGroup
            key={teamId}
            title={teamName}
            itemCount={teamStreams.length}
            defaultOpen={teamStreams.length <= 10}
            isOpen={useCustomExpanded ? expandedGroups.has(teamId) : undefined}
            onToggle={() => handleToggleGroup(teamId)}
          >
          <div className="space-y-4">
            {teamStreams.map((stream) => {
              const status = statusOf(stream);
              const badge = STATUS_BADGE[status];
              const pending = pendingActions.has(stream.id);
              const isLive = status === 'running' || status === 'escalated';
              const isStopped = status === 'stopped';
              const isUnknown = status === 'unknown';
              return (
              <div key={stream.id} className="glass p-4 mb-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center">
                    <div
                      className="bg-gradient-to-br from-green-500 to-blue-600 rounded-lg flex items-center justify-center text-white font-bold flex-shrink-0 mr-4"
                      style={{
                        width: '64px',
                        height: '64px',
                        fontSize: '24px'
                      }}
                    >
                      {stream.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-white">{stream.name}</div>
                      <div className="text-sm text-white/60">OBS: {stream.obs_source_name}</div>
                    </div>
                  </div>
                  <div className="text-right space-y-2">
                    <div className="flex items-center justify-end gap-2">
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded ${badge.className}`}
                        title={isUnknown ? 'Supervisor unreachable — showing saved state' : undefined}
                      >
                        <span aria-hidden="true" className="mr-1">{badge.symbol}</span>
                        {badge.label}
                      </span>
                      <span className="text-sm text-white/40">ID: {stream.id}</span>
                    </div>
                    <div className="flex justify-end flex-wrap gap-2">
                      <button
                        onClick={() => onStart(stream)}
                        disabled={pending || (!isStopped && !isUnknown)}
                        className="btn btn-success text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Start this stream"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start
                      </button>
                      <button
                        onClick={() => onRestart(stream)}
                        disabled={pending || (!isLive && !isUnknown)}
                        className="btn btn-secondary text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Restart this stream"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        Restart
                      </button>
                      <button
                        onClick={() => onStop(stream)}
                        disabled={pending || (!isLive && !isUnknown)}
                        className="btn btn-warning text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Stop this stream"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          <rect x="9" y="9" width="6" height="6" rx="1" strokeWidth={2} />
                        </svg>
                        Stop
                      </button>
                      <button
                        onClick={() => togglePreview(stream.id)}
                        className="btn btn-scene-preview text-sm"
                        aria-pressed={previewing.has(stream.id)}
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        {previewing.has(stream.id) ? 'Hide' : 'Preview'}
                      </button>
                      <a
                        href={stream.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-primary text-sm mr-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                        View Stream
                      </a>
                      <button
                        onClick={() => onDelete(stream)}
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
                {previewing.has(stream.id) && (
                  <StreamPreview streamId={stream.id} label={stream.name} />
                )}
              </div>
              );
            })}
          </div>
        </CollapsibleGroup>
      ))}
      </div>
    </div>
  );
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
  // Supervisor control state: live status snapshot, reachability, per-stream
  // in-flight actions, and the Stop/Restart confirmation target.
  const [statusBySource, setStatusBySource] = useState<Map<string, string>>(new Map());
  const [supervisorReachable, setSupervisorReachable] = useState(false);
  const [pendingActions, setPendingActions] = useState<Set<number>>(new Set());
  const [controlConfirm, setControlConfirm] = useState<{id: number; name: string; action: 'stop' | 'restart'} | null>(null);
  const [isControlling, setIsControlling] = useState(false);
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

      const teams = teamsData.data;
      const streams = streamsData.data;

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

  // Poll the supervisor health snapshot so the control buttons reflect live
  // status. Degrades gracefully when the supervisor is unreachable.
  const pollHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/supervisor/health');
      const data = await res.json();
      if (data?.reachable) {
        const map = new Map<string, string>();
        for (const s of data.streams ?? []) map.set(s.streamId, s.status);
        setStatusBySource(map);
        setSupervisorReachable(true);
      } else {
        setSupervisorReachable(false);
        setStatusBySource(new Map());
      }
    } catch {
      setSupervisorReachable(false);
    }
  }, []);

  useEffect(() => {
    pollHealth();
    const interval = setInterval(pollHealth, 5000);
    return () => clearInterval(interval);
  }, [pollHealth]);

  const runControlAction = useCallback(
    async (stream: Stream, action: 'start' | 'stop' | 'restart') => {
      setPendingActions(prev => new Set(prev).add(stream.id));
      try {
        const res = await fetch(`/api/supervisor/streams/${stream.id}/${action}`, {
          method: 'POST',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          if (action === 'restart' && data.restarted === false) {
            showError(
              'Restart Incomplete',
              `"${stream.name}" was not restarted — it may be stopped or the supervisor is unreachable.`
            );
          } else if (data.degraded) {
            // Break-glass: the supervisor was unreachable; the durable flag was
            // saved by the web layer and applies on the next reconcile.
            const verb = action === 'start' ? 'start' : 'stop';
            showSuccess(
              'Saved — supervisor offline',
              `Queued ${verb} for "${stream.name}". It applies when the supervisor reconnects.`
            );
          } else {
            const verb = action === 'start' ? 'Started' : action === 'stop' ? 'Stopped' : 'Restarted';
            showSuccess(`Stream ${verb}`, `"${stream.name}" has been ${verb.toLowerCase()}.`);
          }
          // Status comes from the authoritative supervisor poll, not an
          // optimistic local flag (the web no longer owns the disabled write).
          pollHealth();
        } else {
          showError(`Failed to ${action} stream`, data.error || 'Unknown error occurred');
        }
      } catch {
        showError(`Failed to ${action} stream`, 'Network error or server unavailable');
      } finally {
        setPendingActions(prev => {
          const next = new Set(prev);
          next.delete(stream.id);
          return next;
        });
      }
    },
    [showSuccess, showError, pollHealth]
  );

  const handleStart = (stream: Stream) => {
    runControlAction(stream, 'start');
  };

  const handleControlConfirm = async () => {
    if (!controlConfirm) return;
    setIsControlling(true);
    const stream = streams.find(s => s.id === controlConfirm.id);
    if (stream) await runControlAction(stream, controlConfirm.action);
    setIsControlling(false);
    setControlConfirm(null);
  };


  const extractTwitchUsername = (input: string): string => {
    const trimmed = input.trim();
    
    // If it's a URL, extract username
    const urlPatterns = [
      /^https?:\/\/(www\.)?twitch\.tv\/([a-zA-Z0-9_]+)\/?$/,
      /^(www\.)?twitch\.tv\/([a-zA-Z0-9_]+)\/?$/,
      /^twitch\.tv\/([a-zA-Z0-9_]+)\/?$/
    ];
    
    for (const pattern of urlPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        return match[match.length - 1]; // Last capture group is always the username
      }
    }
    
    // Otherwise assume it's just a username
    return trimmed;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    
    // Special handling for twitch_username to extract from URL if needed
    if (name === 'twitch_username') {
      const username = extractTwitchUsername(value);
      setFormData((prev) => ({ ...prev, [name]: username }));
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }
    
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
              Twitch Username or URL
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
              placeholder="Enter username or paste full Twitch URL (e.g., 'streamer' or 'https://twitch.tv/streamer')"
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
          <StreamsByTeam
            streams={streams}
            teams={teams}
            onDelete={(stream) => setDeleteConfirm({ id: stream.id, name: stream.name })}
            onStart={handleStart}
            onStop={(stream) => setControlConfirm({ id: stream.id, name: stream.name, action: 'stop' })}
            onRestart={(stream) => setControlConfirm({ id: stream.id, name: stream.name, action: 'restart' })}
            statusBySource={statusBySource}
            supervisorReachable={supervisorReachable}
            pendingActions={pendingActions}
          />
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

      {/* Stop / Restart Confirmation Modal */}
      {controlConfirm && (
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
            <h3 className="text-xl font-bold text-white mb-4">
              {controlConfirm.action === 'stop' ? 'Confirm Stop' : 'Confirm Restart'}
            </h3>
            <p className="text-white/80 mb-6">
              {controlConfirm.action === 'stop' ? (
                <>Stop the stream &ldquo;{controlConfirm.name}&rdquo;? This interrupts its live feed and keeps it stopped until you start it again.</>
              ) : (
                <>Restart the stream &ldquo;{controlConfirm.name}&rdquo;? This briefly interrupts its live feed.</>
              )}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setControlConfirm(null)}
                disabled={isControlling}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={handleControlConfirm}
                disabled={isControlling}
                className={controlConfirm.action === 'stop' ? 'btn btn-warning' : 'btn btn-primary'}
              >
                {isControlling
                  ? (controlConfirm.action === 'stop' ? 'Stopping...' : 'Restarting...')
                  : (controlConfirm.action === 'stop' ? 'Stop Stream' : 'Restart Stream')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}