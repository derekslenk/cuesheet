'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Team } from '@/types';

export default function TeamsClient() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTeamName, setNewTeamName] = useState('');
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [editingName, setEditingName] = useState('');

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
    <div className="max-w-4xl mx-auto p-5">
      <div className="text-center mb-5">
        <Link
          href="/"
          className="underline text-blue-600 hover:text-blue-800 visited:text-purple-600"
        >
          Back to Stream Management
        </Link>
      </div>

      <div className="bg-white rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Add New Team</h2>
        <form onSubmit={handleAddTeam} className="flex gap-3">
          <input
            type="text"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            placeholder="Team name"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Add Team
          </button>
        </form>
      </div>

      <div className="bg-white rounded-lg shadow">
        <h2 className="text-xl font-semibold p-6 border-b">Existing Teams</h2>
        
        {isLoading ? (
          <div className="p-6 text-center text-gray-500">Loading...</div>
        ) : teams.length === 0 ? (
          <div className="p-6 text-center text-gray-500">No teams found. Add one above!</div>
        ) : (
          <div className="divide-y">
            {teams.map((team) => (
              <div key={team.team_id} className="p-6 flex items-center justify-between">
                {editingTeam?.team_id === team.team_id ? (
                  <>
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 mr-3"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleUpdateTeam(team.team_id)}
                        className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEditing}
                        className="px-3 py-1 bg-gray-600 text-white rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <span className="font-medium">{team.team_name}</span>
                      <span className="text-gray-500 text-sm ml-2">(ID: {team.team_id})</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(team)}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteTeam(team.team_id)}
                        className="px-3 py-1 bg-red-600 text-white rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500"
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}