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
          <div className="flex gap-3">
            <input
              type="text"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              placeholder="Enter team name"
              className="input flex-1"
              required
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn"
            >
              <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
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
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="input flex-1"
                      autoFocus
                    />
                    <button
                      onClick={() => handleUpdateTeam(team.team_id)}
                      className="btn"
                    >
                      <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                      Save
                    </button>
                    <button
                      onClick={cancelEditing}
                      className="btn-secondary"
                    >
                      <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
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
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEditing(team)}
                        className="btn-secondary"
                      >
                        <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                        </svg>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.team_id)}
                        className="btn bg-red-600 hover:bg-red-700"
                      >
                        <svg className="icon-sm" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" clipRule="evenodd" />
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
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