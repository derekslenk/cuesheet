'use client';

import { useState, useEffect } from 'react';
import { Team } from '@/types';
import { useToast } from '@/lib/useToast';
import { ToastContainer } from '@/components/Toast';

interface GroupVerification {
  team_id: number;
  team_name: string;
  group_name: string;
  group_uuid: string | null;
  exists_in_obs: boolean;
  matched_by: 'uuid' | 'name' | null;
  current_name: string | null;
  name_changed: boolean;
}

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [groupVerification, setGroupVerification] = useState<GroupVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isVerifying, setIsVerifying] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingName, setEditingName] = useState('');
  const [creatingGroupForTeam, setCreatingGroupForTeam] = useState<number | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [updatingTeamId, setUpdatingTeamId] = useState<number | null>(null);
  const [deletingTeamId, setDeletingTeamId] = useState<number | null>(null);
  const [validationErrors, setValidationErrors] = useState<{[key: string]: string}>({});
  const { toasts, removeToast, showSuccess, showError } = useToast();

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      setTeams(data.data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyGroups = async () => {
    setIsVerifying(true);
    try {
      const res = await fetch('/api/verifyGroups');
      const data = await res.json();
      if (data.success) {
        setGroupVerification(data.data.teams_with_groups);
        const missing = data.data.missing_in_obs.length;
        const orphaned = data.data.orphaned_in_obs.length;
        const nameChanges = data.data.name_mismatches?.length || 0;
        
        if (missing > 0 || orphaned > 0 || nameChanges > 0) {
          const issues = [];
          if (missing > 0) issues.push(`${missing} missing in OBS`);
          if (orphaned > 0) issues.push(`${orphaned} orphaned in OBS`);
          if (nameChanges > 0) issues.push(`${nameChanges} name mismatches`);
          showError('Groups Out of Sync', issues.join(', '));
        } else {
          showSuccess('Groups Verified', 'All groups are in sync with OBS');
        }
      }
    } catch (error) {
      console.error('Error verifying groups:', error);
      showError('Verification Failed', 'Could not verify groups with OBS');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Client-side validation
    const errors: {[key: string]: string} = {};
    if (!newTeamName.trim()) {
      errors.newTeamName = 'Team name is required';
    } else if (newTeamName.trim().length < 2) {
      errors.newTeamName = 'Team name must be at least 2 characters';
    } else if (newTeamName.trim().length > 50) {
      errors.newTeamName = 'Team name must be less than 50 characters';
    }
    
    setValidationErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Validation Error', 'Please fix the form errors');
      return;
    }
    
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/teams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: newTeamName }),
      });

      if (res.ok) {
        setNewTeamName('');
        fetchTeams();
        showSuccess('Team Added', `"${newTeamName}" has been added successfully`);
      } else {
        const error = await res.json();
        showError('Failed to Add Team', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error adding team:', error);
      showError('Failed to Add Team', 'Network error or server unavailable');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTeam = async (teamId: number) => {
    // Client-side validation
    if (!editingName.trim()) {
      showError('Validation Error', 'Team name cannot be empty');
      return;
    }
    if (editingName.trim().length < 2) {
      showError('Validation Error', 'Team name must be at least 2 characters');
      return;
    }
    if (editingName.trim().length > 50) {
      showError('Validation Error', 'Team name must be less than 50 characters');
      return;
    }

    setUpdatingTeamId(teamId);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ team_name: editingName }),
      });

      if (res.ok) {
        setEditingTeam(null);
        setEditingName('');
        fetchTeams();
        showSuccess('Team Updated', `Team name changed to "${editingName}"`);
      } else {
        const error = await res.json();
        showError('Failed to Update Team', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error updating team:', error);
      showError('Failed to Update Team', 'Network error or server unavailable');
    } finally {
      setUpdatingTeamId(null);
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    const teamToDelete = teams.find(t => t.team_id === teamId);
    if (!confirm('Are you sure you want to delete this team? This will also delete all associated streams.')) {
      return;
    }

    setDeletingTeamId(teamId);
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchTeams();
        showSuccess('Team Deleted', `"${teamToDelete?.team_name || 'Team'}" has been deleted`);
      } else {
        const error = await res.json();
        showError('Failed to Delete Team', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      showError('Failed to Delete Team', 'Network error or server unavailable');
    } finally {
      setDeletingTeamId(null);
    }
  };

  const handleSyncAllGroups = async () => {
    if (!confirm('This will create OBS groups for all teams that don\'t have one. Continue?')) {
      return;
    }
    
    setIsSyncing(true);
    try {
      const res = await fetch('/api/syncGroups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const result = await res.json();
        fetchTeams();
        showSuccess('Groups Synced', `${result.summary.successful} groups created successfully`);
        if (result.summary.failed > 0) {
          showError('Some Failures', `${result.summary.failed} groups failed to create`);
        }
      } else {
        const error = await res.json();
        showError('Failed to Sync Groups', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error syncing groups:', error);
      showError('Failed to Sync Groups', 'Network error or server unavailable');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateGroup = async (teamId: number, teamName: string) => {
    const groupName = prompt(`Enter group name for team "${teamName}":`, teamName);
    if (!groupName) return;
    
    setCreatingGroupForTeam(teamId);
    try {
      const res = await fetch('/api/createGroup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ teamId, groupName }),
      });

      if (res.ok) {
        fetchTeams();
        verifyGroups(); // Refresh verification after creating
        showSuccess('Group Created', `OBS group "${groupName}" created for team "${teamName}"`);
      } else {
        const error = await res.json();
        showError('Failed to Create Group', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error creating group:', error);
      showError('Failed to Create Group', 'Network error or server unavailable');
    } finally {
      setCreatingGroupForTeam(null);
    }
  };

  const handleClearInvalidGroup = async (teamId: number, teamName: string) => {
    if (!confirm(`Clear the invalid group assignment for team "${teamName}"? This will only update the database, not delete anything from OBS.`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_name: null, group_uuid: null }),
      });

      if (res.ok) {
        fetchTeams();
        verifyGroups();
        showSuccess('Group Cleared', `Invalid group assignment cleared for "${teamName}"`);
      } else {
        const error = await res.json();
        showError('Failed to Clear Group', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error clearing group:', error);
      showError('Failed to Clear Group', 'Network error or server unavailable');
    }
  };

  const handleUpdateGroupName = async (teamId: number, teamName: string, currentName: string) => {
    if (!confirm(`Update the group name for team "${teamName}" from "${teamName}" to "${currentName}" to match OBS?`)) {
      return;
    }
    
    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_name: currentName }),
      });

      if (res.ok) {
        fetchTeams();
        verifyGroups();
        showSuccess('Group Name Updated', `Group name updated to "${currentName}"`);
      } else {
        const error = await res.json();
        showError('Failed to Update Group Name', error.error || 'Unknown error occurred');
      }
    } catch (error) {
      console.error('Error updating group name:', error);
      showError('Failed to Update Group Name', 'Network error or server unavailable');
    }
  };

  const startEditing = (team: Team) => {
    setEditingTeam(team);
    setEditingName(team.team_name);
  };

  const cancelEditing = () => {
    setEditingTeam(null);
    setEditingName('');
  };

  return (
    <div className="container section">
      {/* Title */}
      <div className="text-center mb-8">
        <h1 className="title">Team Management</h1>
        <p className="subtitle">
          Organize your streams by creating and managing teams
        </p>
      </div>

      {/* Add New Team */}
      <div className="glass p-6 mb-6">
        <h2 className="card-title">Add New Team</h2>
        <form onSubmit={handleAddTeam} className="max-w-md mx-auto">
          <div>
            <div className="form-row">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => {
                  setNewTeamName(e.target.value);
                  // Clear validation error when user starts typing
                  if (validationErrors.newTeamName) {
                    setValidationErrors(prev => ({ ...prev, newTeamName: '' }));
                  }
                }}
                placeholder="Enter team name"
                className={`input ${
                  validationErrors.newTeamName ? 'border-red-500/60 bg-red-500/10' : ''
                }`}
                style={{ flex: 1 }}
                required
              />
              <button
                type="submit"
                disabled={isSubmitting}
                className="btn btn-success"
            >
              <span className="icon">➕</span>
              {isSubmitting ? 'Adding...' : 'Add Team'}
              </button>
            </div>
            {validationErrors.newTeamName && (
              <div className="text-red-400 text-sm mt-2 text-center">
                {validationErrors.newTeamName}
              </div>
            )}
          </div>
        </form>
      </div>

      {/* Teams List */}
      <div className="glass p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="card-title">Existing Teams</h2>
          <div className="button-group">
            <button
              onClick={verifyGroups}
              disabled={isVerifying || isLoading}
              className="btn btn-secondary"
              title="Check if database groups exist in OBS"
            >
              <span className="icon">🔍</span>
              {isVerifying ? 'Verifying...' : 'Verify Groups'}
            </button>
            <button
              onClick={handleSyncAllGroups}
              disabled={isSyncing || isLoading}
              className="btn btn-success"
              title="Create OBS groups for all teams without groups"
            >
              <span className="icon">🔄</span>
              {isSyncing ? 'Syncing...' : 'Sync All Groups'}
            </button>
          </div>
        </div>
        
        {isLoading ? (
          <div className="text-center p-8">
            <div className="w-8 h-8 border-2 border-white/30 border-t-white rounded-full animate-spin mx-auto mb-4"></div>
            <div className="text-white/60">Loading teams...</div>
          </div>
        ) : teams.length === 0 ? (
          <div className="text-center p-8">
            <svg className="icon-lg mx-auto mb-4 text-white/40" fill="currentColor" viewBox="0 0 20 20">
              <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3z" />
            </svg>
            <div className="text-white/60">No teams found</div>
            <div className="text-white/40 text-sm">Create your first team above!</div>
          </div>
        ) : (
          <div className="space-y-4">
            {teams.map((team) => {
              const shouldShowCreateButton = !team.group_name || (typeof team.group_name === 'string' && team.group_name.trim() === '');
              const verification = groupVerification.find(v => v.team_id === team.team_id);
              return (
              <div key={team.team_id} className="glass p-4 mb-4">
                {editingTeam?.team_id === team.team_id ? (
                  <div className="form-row">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="input"
                      style={{ flex: 1 }}
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateTeam(team.team_id)}
                      disabled={updatingTeamId === team.team_id}
                      className="btn btn-success btn-sm"
                      title="Save changes"
                    >
                      <span className="icon">✅</span>
                      {updatingTeamId === team.team_id ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={cancelEditing}
                      disabled={updatingTeamId === team.team_id}
                      className="btn-secondary btn-sm"
                      title="Cancel editing"
                    >
                      <span className="icon">❌</span>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">
                        {team.team_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-semibold text-white">{team.team_name}</div>
                        <div className="text-sm text-white/60">ID: {team.team_id}</div>
                        {team.group_name ? (
                          <div className="text-sm">
                            <span className={verification && !verification.exists_in_obs ? 'text-red-400' : 'text-green-400'}>
                              OBS Group: {verification?.current_name || team.group_name}
                            </span>
                            {verification && !verification.exists_in_obs && (
                              <span className="text-red-400 ml-2">⚠️ Not found in OBS</span>
                            )}
                            {verification && verification.name_changed && (
                              <span className="text-yellow-400 ml-2">📝 Name changed in OBS</span>
                            )}
                            {verification?.matched_by === 'uuid' && (
                              <span className="text-blue-400 ml-2">🆔 Linked by UUID</span>
                            )}
                          </div>
                        ) : (
                          <div className="text-sm text-orange-400">No OBS Group</div>
                        )}
                      </div>
                    </div>
                    <div className="button-group">
                      {shouldShowCreateButton && (
                        <button
                          onClick={() => handleCreateGroup(team.team_id, team.team_name)}
                          disabled={creatingGroupForTeam === team.team_id || deletingTeamId === team.team_id || updatingTeamId === team.team_id}
                          className="btn-success btn-sm"
                          title="Create OBS group"
                        >
                          <span className="icon">🎬</span>
                          {creatingGroupForTeam === team.team_id ? 'Creating...' : 'Create Group'}
                        </button>
                      )}
                      {verification && !verification.exists_in_obs && (
                        <button
                          onClick={() => handleClearInvalidGroup(team.team_id, team.team_name)}
                          disabled={updatingTeamId === team.team_id || deletingTeamId === team.team_id}
                          className="btn-danger btn-sm"
                          title="Clear invalid group assignment"
                        >
                          <span className="icon">🗑️</span>
                          Clear Invalid
                        </button>
                      )}
                      {verification && verification.name_changed && verification.current_name && (
                        <button
                          onClick={() => handleUpdateGroupName(team.team_id, team.team_name, verification.current_name!)}
                          disabled={updatingTeamId === team.team_id || deletingTeamId === team.team_id}
                          className="btn btn-secondary btn-sm"
                          title="Update database to match OBS name"
                        >
                          <span className="icon">📝</span>
                          Update Name
                        </button>
                      )}
                      <button
                        onClick={() => startEditing(team)}
                        disabled={deletingTeamId === team.team_id || updatingTeamId === team.team_id}
                        className="btn-secondary btn-sm"
                        title="Edit team"
                      >
                        <span className="icon">✏️</span>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.team_id)}
                        disabled={deletingTeamId === team.team_id || updatingTeamId === team.team_id}
                        className="btn-danger btn-sm"
                        title="Delete team"
                      >
                        <span className="icon">🗑️</span>
                        {deletingTeamId === team.team_id ? 'Deleting...' : 'Delete'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Toast Notifications */}
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  );
}