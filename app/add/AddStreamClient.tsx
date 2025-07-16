'use client';

import { useState, useEffect } from 'react';
import Dropdown from '../../components/Dropdown'; // Adjust the import path as needed
import { Team } from '@/types';

export default function AddStreamClient() {
  const [formData, setFormData] = useState({
    name: '',
    obs_source_name: '',
    url: '',
    team_id: null, // Include team_id in the form data
  });
  const [teams, setTeams] = useState([]); // State to store teams
  const [message, setMessage] = useState('');

  // Fetch teams on component mount
  useEffect(() => {
    async function fetchTeams() {
      try {
        const response = await fetch('/api/teams');
        const data = await response.json();

        // Map the API data to the format required by the Dropdown
        setTeams(
          data.map((team:Team) => ({
            id: team.team_id,
            name: team.team_name,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch teams:', error);
      }
    }
    fetchTeams();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleTeamSelect = (teamId:number) => {
    // @ts-expect-error - team_id can be null or number in formData, but TypeScript expects only number
    setFormData((prev) => ({ ...prev, team_id: teamId }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');

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
      } else {
        setMessage(data.error || 'Something went wrong.');
      }
    } catch (error) {
      console.error('Error adding stream:', error);
      setMessage('Failed to add stream.');
    }
  };

  return (
    <div style={{ maxWidth: '600px', margin: '50px auto', padding: '20px', border: '1px solid #ccc' }}>
      <h2>Add New Stream</h2>
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '10px' }}>
          <label>
            Name:
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
              style={{ display: 'block', width: '100%', padding: '8px', margin: '5px 0' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>
            OBS Source Name:
            <input
              type="text"
              name="obs_source_name"
              value={formData.obs_source_name}
              onChange={handleInputChange}
              required
              style={{ display: 'block', width: '100%', padding: '8px', margin: '5px 0' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>
            URL:
            <input
              type="url"
              name="url"
              value={formData.url}
              onChange={handleInputChange}
              required
              style={{ display: 'block', width: '100%', padding: '8px', margin: '5px 0' }}
            />
          </label>
        </div>
        <div style={{ marginBottom: '10px' }}>
          <label>Team:</label>
          <Dropdown
            options={teams}
            activeId={formData.team_id}
            onSelect={handleTeamSelect}
            label="Select a Team"
          />
        </div>
        <button
          type="submit"
          style={{
            padding: '10px 20px',
            background: '#0070f3',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Add Stream
        </button>
      </form>
      {message && (
        <p style={{ marginTop: '20px', color: message.includes('successfully') ? 'green' : 'red' }}>
          {message}
        </p>
      )}
    </div>
  );
}
