const { OBSWebSocket } = require('obs-websocket-js');

let obs = null;
let isConnecting = false;
let connectionPromise = null;

async function ensureConnected() {
  // If already connected, return the existing client
  if (obs && obs.identified) {
    return obs;
  }

  // If already in the process of connecting, wait for it
  if (isConnecting && connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  isConnecting = true;
  connectionPromise = connectToOBS();
  
  try {
    await connectionPromise;
    return obs;
  } finally {
    isConnecting = false;
    connectionPromise = null;
  }
}

async function connectToOBS() {
  const OBS_HOST = process.env.OBS_WEBSOCKET_HOST || '127.0.0.1';
  const OBS_PORT = process.env.OBS_WEBSOCKET_PORT || '4455';
  const OBS_PASSWORD = process.env.OBS_WEBSOCKET_PASSWORD || '';

  // Create new client if needed
  if (!obs) {
    obs = new OBSWebSocket();
    
    // Set up event handlers for connection management
    obs.on('ConnectionClosed', () => {
      console.log('OBS WebSocket connection closed');
      obs = null;
    });

    obs.on('ConnectionError', (err) => {
      console.error('OBS WebSocket connection error:', err);
      obs = null;
    });

    obs.on('Identified', () => {
      console.log('OBS WebSocket successfully identified');
    });
  }

  try {
    console.log('Connecting to OBS WebSocket...');
    console.log('Host:', OBS_HOST);
    console.log('Port:', OBS_PORT);
    console.log('Password:', OBS_PASSWORD ? '***' : '(none)');

    await obs.connect(`ws://${OBS_HOST}:${OBS_PORT}`, OBS_PASSWORD);
    console.log('Connected to OBS WebSocket.');
    return obs;
  } catch (err) {
    console.error('Failed to connect to OBS WebSocket:', err.message);
    obs = null;
    throw err;
  }
}

async function getOBSClient() {
  return await ensureConnected();
}

function getConnectionStatus() {
  return {
    connected: obs && obs.identified,
    client: obs
  };
}

async function disconnectFromOBS() {
  if (obs) {
    try {
      await obs.disconnect();
      console.log('Disconnected from OBS WebSocket.');
    } catch (err) {
      console.error('Error disconnecting from OBS:', err.message);
    } finally {
      obs = null;
    }
  }
}

async function addSourceToSwitcher(inputName, newSources) {
  try {
    const obsClient = await getOBSClient();

    // Step 1: Get current input settings
    const { inputSettings } = await obsClient.call('GetInputSettings', { inputName });
    // console.log('Current Settings:', inputSettings);

    // Step 2: Add new sources to the sources array
    const updatedSources = [...inputSettings.sources, ...newSources];

    // Step 3: Update the settings with the new sources array
    await obsClient.call('SetInputSettings', {
      inputName,
      inputSettings: {
        ...inputSettings,
        sources: updatedSources,
      },
    });

    console.log('Updated settings successfully for', inputName);
  } catch (error) {
    console.error('Error updating settings:', error.message);
    throw error;
  }
}

// async function addSourceToGroup(obs, teamName, obs_source_name, url) {
//   try {
//     // Step 1: Check if the group exists
//     const { scenes } = await obs.call('GetSceneList');
//     const groupExists = scenes.some((scene) => scene.sceneName === teamName);

//     // Step 2: Create the group if it doesn't exist
//     if (!groupExists) {
//       console.log(`Group "${teamName}" does not exist. Creating it.`);
//       await obs.call('CreateScene', { sceneName: teamName });
//     } else {
//       console.log(`Group "${teamName}" already exists.`);
//     }

//     // Step 3: Add the source to the group
//     console.log(`Adding source "${obs_source_name}" to group "${teamName}".`);
//     await obs.call('CreateInput', {
//       sceneName: teamName,
//       inputName: obs_source_name,
//       inputKind: 'browser_source',
//       inputSettings: {
//         width: 1600,
//         height: 900,
//         url,
//         control_audio: true,
//       },
//     });

//     // Step 4: Enable "Control audio via OBS"
//     await obs.call('SetInputSettings', {
//       inputName: obs_source_name,
//       inputSettings: {
//         control_audio: true, // Enable audio control
//       },
//       overlay: true, // Keep existing settings and apply changes
//     });

//     console.log(`Source "${obs_source_name}" successfully added to group "${teamName}".`);
//   } catch (error) {
//     console.error('Error adding source to group:', error.message);
//   }
// }


// Export all functions
module.exports = { 
  connectToOBS, 
  getOBSClient, 
  disconnectFromOBS, 
  addSourceToSwitcher, 
  ensureConnected,
  getConnectionStatus
};