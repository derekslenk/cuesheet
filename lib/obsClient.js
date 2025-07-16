// const config = require('../config');
const { OBSWebSocket } = require('obs-websocket-js');

let obs = null;

async function connectToOBS() {
  if (!obs) {
    obs = new OBSWebSocket();
  }

  try {
    const OBS_HOST = process.env.OBS_WEBSOCKET_HOST || '127.0.0.1';
    const OBS_PORT = process.env.OBS_WEBSOCKET_PORT || '4455';
    const OBS_PASSWORD = process.env.OBS_WEBSOCKET_PASSWORD || '';

    console.log('Connecting to OBS WebSocket...');
    console.log('Host:', OBS_HOST);
    console.log('Port:', OBS_PORT);
    console.log('Password:', OBS_PASSWORD ? '***' : '(none)');

    await obs.connect(`ws://${OBS_HOST}:${OBS_PORT}`, OBS_PASSWORD);
    console.log('Connected to OBS WebSocket.');
  } catch (err) {
    console.error('Failed to connect to OBS WebSocket:', err.message);
    throw err;
  }
}

function getOBSClient() {
  if (!obs) {
    throw new Error('OBS WebSocket client is not initialized. Call connectToOBS() first.');
  }
  // console.log('client', obs)
  return obs;
}

async function disconnectFromOBS() {
  if (obs) {
    await obs.disconnect();
    console.log('Disconnected from OBS WebSocket.');
    obs = null;
  }
}

async function addSourceToSwitcher(inputName, newSources) {
  if (!obs) {
    obs = new OBSWebSocket();
  }

  try {
    const OBS_HOST = process.env.OBS_WEBSOCKET_HOST || '127.0.0.1';
    const OBS_PORT = process.env.OBS_WEBSOCKET_PORT || '4455';
    const OBS_PASSWORD = process.env.OBS_WEBSOCKET_PASSWORD || '';

    await obs.connect(`ws://${OBS_HOST}:${OBS_PORT}`, OBS_PASSWORD);

    // Step 1: Get current input settings
    const { inputSettings } = await obs.call('GetInputSettings', { inputName });
    // console.log('Current Settings:', inputSettings);

    // Step 2: Add new sources to the sources array
    const updatedSources = [...inputSettings.sources, ...newSources];

    // Step 3: Update the settings with the new sources array
    await obs.call('SetInputSettings', {
      inputName,
      inputSettings: {
        ...inputSettings,
        sources: updatedSources,
      },
    });

    console.log('Updated settings successfully for', inputName);
    obs.disconnect();
  } catch (error) {
    console.error('Error updating settings:', error.message);
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
module.exports = { connectToOBS, getOBSClient, disconnectFromOBS, addSourceToSwitcher};