import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { connectToOBS, getOBSClient, disconnectFromOBS, addSourceToSwitcher, createGroupIfNotExists, addSourceToGroup } from '../../../lib/obsClient';
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import path from 'path';
import { getTableName, BASE_TABLE_NAMES } from '../../../lib/constants';

interface OBSClient {
    call: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface OBSInput {
inputName: string;
}


interface GetInputListResponse {
inputs: OBSInput[];
}
const screens = [
  'ss_large',
  'ss_left',
  'ss_right',
  'ss_top_left',
  'ss_top_right',
  'ss_bottom_left',
  'ss_bottom_right',
];

async function fetchTeamInfo(teamId: number) {
  const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
  try {
    const dbPath = path.join(FILE_DIRECTORY, 'sources.db');
    const db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });

    const teamsTableName = getTableName(BASE_TABLE_NAMES.TEAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });

    const teamInfo = await db.get(
      `SELECT team_name, group_name FROM ${teamsTableName} WHERE team_id = ?`,
      [teamId]
    );

    await db.close();
    return teamInfo;
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error fetching team info:', error.message);
    } else {
      console.error('An unknown error occurred:', error);
    }
    return null;
  }
}


import { validateStreamInput } from '../../../lib/security';

// Generate OBS source name from stream name
function generateOBSSourceName(streamName: string): string {
  return streamName.toLowerCase().replace(/\s+/g, '_') + '_twitch';
}

export async function POST(request: NextRequest) {
  let name: string, url: string, team_id: number, obs_source_name: string;

  // Parse and validate request body
  try {
    const body = await request.json();
    const validation = validateStreamInput(body);

    if (!validation.valid) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.errors 
      }, { status: 400 });
    }

    ({ name, url, team_id } = validation.data!);
    
    // Auto-generate OBS source name from stream name
    obs_source_name = generateOBSSourceName(name);

  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }

  try {

    // Connect to OBS WebSocket
    console.log("Pre-connect")
    await connectToOBS();
    console.log('Pre client')
    const obs: OBSClient = await getOBSClient();
    // obs.on('message', (msg) => {
    //   console.log('Message from OBS:', msg);
    // });
    let inputs;
    try {
    const response = await obs.call('GetInputList');
    const inputListResponse = response as unknown as GetInputListResponse;
    inputs = inputListResponse.inputs;
    // console.log('Inputs:', inputs);
    } catch (err) {
    if (err instanceof Error) {
        console.error('Failed to fetch inputs:', err.message);
    } else {
        console.error('Failed to fetch inputs:', err);
    }
    throw new Error('GetInputList failed.');
    }
    
    const teamInfo = await fetchTeamInfo(team_id);
    if (!teamInfo) {
      throw new Error('Team not found');
    }
    
    console.log('Team Info:', teamInfo);
    
    // Use group_name if it exists, otherwise use team_name
    const groupName = teamInfo.group_name || teamInfo.team_name;
    
    const sourceExists = inputs.some((input: OBSInput) => input.inputName === obs_source_name);

    if (!sourceExists) {
      // Create/ensure group exists and add source to it
      await createGroupIfNotExists(groupName);
      await addSourceToGroup(groupName, obs_source_name, url);

      console.log(`OBS source "${obs_source_name}" created.`);

      for (const screen of screens) {
        try {
          await addSourceToSwitcher(screen, [
            { hidden: false, selected: false, value: obs_source_name },
          ]);
        } catch (error) {
        if (error instanceof Error) {
            console.error(`Failed to add source to ${screen}:`, error.message);
        } else {
            console.error(`Failed to add source to ${screen}:`, error);
        }
        }
      }
      
    } else {
      console.log(`OBS source "${obs_source_name}" already exists.`);
    }

    const db = await getDatabase();
    const streamsTableName = getTableName(BASE_TABLE_NAMES.STREAMS, {
      year: 2025,
      season: 'summer',
      suffix: 'sat'
    });
    const query = `INSERT INTO ${streamsTableName} (name, obs_source_name, url, team_id) VALUES (?, ?, ?, ?)`;
    db.run(query, [name, obs_source_name, url, team_id])
    await disconnectFromOBS();
    return NextResponse.json({ message: 'Stream added successfully' }, {status: 201})
} catch (error) {
if (error instanceof Error) {
    console.error('Error adding stream:', error.message);
} else {
    console.error('An unknown error occurred while adding stream:', error);
}
await disconnectFromOBS();
return NextResponse.json({ error: 'Failed to add stream' }, { status: 500 });
}
}