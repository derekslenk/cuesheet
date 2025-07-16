import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { connectToOBS, getOBSClient, disconnectFromOBS, addSourceToSwitcher } from '../../../lib/obsClient';

interface OBSClient {
    call: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
}

interface OBSScene {
sceneName: string;
}

interface OBSInput {
inputName: string;
}

interface GetSceneListResponse {
currentProgramSceneName: string;
currentPreviewSceneName: string;
scenes: OBSScene[];
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

async function fetchTeamName(teamId: number) {
  try {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const response = await fetch(`${baseUrl}/api/getTeamName?team_id=${teamId}`);
    if (!response.ok) {
      throw new Error('Failed to fetch team name');
    }
    const data = await response.json();
    return data.team_name;
} catch (error) {
if (error instanceof Error) {
    console.error('Error:', error.message);
} else {
    console.error('An unknown error occurred:', error);
}
return null;
}
}

async function addBrowserSourceWithAudioControl(obs: OBSClient, sceneName: string, inputName: string, url: string) {
  try {
    // Step 1: Create the browser source input
    await obs.call('CreateInput', {
      sceneName,
      inputName,
      inputKind: 'browser_source',
      inputSettings: {
        width: 1600,
        height: 900,
        url,
      },
    });

    console.log(`Browser source "${inputName}" created successfully.`);

    // Step 2: Wait for the input to initialize
    let inputReady = false;
    for (let i = 0; i < 10; i++) {
      try {
        await obs.call('GetInputSettings', { inputName });
        inputReady = true;
        break;
      } catch  {
        console.log(`Waiting for input "${inputName}" to initialize...`);
        await new Promise((resolve) => setTimeout(resolve, 500)); // Wait 500ms before retrying
      }
    }

    if (!inputReady) {
      throw new Error(`Input "${inputName}" did not initialize in time.`);
    }


    // Step 3: Enable "Reroute audio"
    await obs.call('SetInputSettings', {
      inputName,
      inputSettings: {
        reroute_audio: true,
      },
      overlay: true, // Keep existing settings and apply changes
    });

    console.log(`Audio rerouted for "${inputName}".`);

    // Step 4: Mute the input
    await obs.call('SetInputMute', {
      inputName,
      inputMuted: true,
    });

    console.log(`Audio muted for "${inputName}".`);
} catch (error) {
if (error instanceof Error) {
    console.error('Error adding browser source with audio control:', error.message);
} else {
    console.error('An unknown error occurred while adding browser source:', error);
}
}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, obs_source_name, url, team_id } = body;

    if (!name || !obs_source_name || !url) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

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
    const teamName = await fetchTeamName(team_id);
    console.log('Team Name:', teamName)
    const response = await obs.call('GetSceneList');
    const sceneListResponse = response as unknown as GetSceneListResponse;
    const { scenes } = sceneListResponse;
    const groupExists = scenes.some((scene: OBSScene) => scene.sceneName === teamName);
    if (!groupExists) {
      await obs.call('CreateScene', { sceneName: teamName });
    }
    
    const sourceExists = inputs.some((input: OBSInput) => input.inputName === obs_source_name);

    if (!sourceExists) {
      await addBrowserSourceWithAudioControl(obs, teamName, obs_source_name, url)

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
    const query = `INSERT INTO streams_2025_spring_adr (name, obs_source_name, url, team_id) VALUES (?, ?, ?, ?)`;
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