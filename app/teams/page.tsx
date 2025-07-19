'use client';

import { useState, useEffect } from 'react';
import { Team } from '@/types';

export default function Teams() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchTeams();
  }, []);

  const fetchTeams = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/teams');
      const data = await res.json();
      setTeams(data);
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    
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
      } else {
        const error = await res.json();
        alert(`Error adding team: ${error.error}`);
      }
    } catch (error) {
      console.error('Error adding team:', error);
      alert('Failed to add team');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateTeam = async (teamId: number) => {
    if (!editingName.trim()) return;

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
      } else {
        const error = await res.json();
        alert(`Error updating team: ${error.error}`);
      }
    } catch (error) {
      console.error('Error updating team:', error);
      alert('Failed to update team');
    }
  };

  const handleDeleteTeam = async (teamId: number) => {
    if (!confirm('Are you sure you want to delete this team? This will also delete all associated streams.')) {
      return;
    }

    try {
      const res = await fetch(`/api/teams/${teamId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchTeams();
      } else {
        const error = await res.json();
        alert(`Error deleting team: ${error.error}`);
      }
    } catch (error) {
      console.error('Error deleting team:', error);
      alert('Failed to delete team');
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
          <div className="form-row">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team name"
              className="input"
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
        </form>
      </div>

      {/* Teams List */}
      <div className="glass p-6">
        <h2 className="card-title">Existing Teams</h2>
        
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
            {teams.map((team) => (
              <div key={team.team_id} className="glass p-4">
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
                      className="btn btn-success btn-sm"
                      title="Save changes"
                    >
                      <span className="icon">✅</span>
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
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
                      </div>
                    </div>
                    <div className="button-group">
                      <button
                        onClick={() => startEditing(team)}
                        className="btn-secondary btn-sm"
                        title="Edit team"
                      >
                        <span className="icon">✏️</span>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.team_id)}
                        className="btn-danger btn-sm"
                        title="Delete team"
                      >
                        <span className="icon">🗑️</span>
                        Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}