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
    console.log('Current Settings for', inputName, ':', inputSettings);

    // Step 2: Initialize sources array if it doesn't exist or is not an array
    let currentSources = [];
    if (Array.isArray(inputSettings.sources)) {
      currentSources = inputSettings.sources;
    } else if (inputSettings.sources) {
      console.log('Sources is not an array, converting:', typeof inputSettings.sources);
      // Try to convert if it's an object or other format
      currentSources = [];
    }

    // Step 3: Add new sources to the sources array
    const updatedSources = [...currentSources, ...newSources];

    // Step 4: Update the settings with the new sources array
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

async function createGroupIfNotExists(groupName) {
  try {
    const obsClient = await getOBSClient();
    
    // Check if the group (scene) exists and get its UUID
    const { scenes } = await obsClient.call('GetSceneList');
    const existingScene = scenes.find((scene) => scene.sceneName === groupName);

    if (!existingScene) {
      console.log(`Creating group "${groupName}"`);
      await obsClient.call('CreateScene', { sceneName: groupName });
      
      // Get the scene UUID after creation
      const { scenes: updatedScenes } = await obsClient.call('GetSceneList');
      const newScene = updatedScenes.find((scene) => scene.sceneName === groupName);
      
      return { 
        created: true, 
        message: `Group "${groupName}" created successfully`,
        sceneUuid: newScene?.sceneUuid || null
      };
    } else {
      console.log(`Group "${groupName}" already exists`);
      return { 
        created: false, 
        message: `Group "${groupName}" already exists`,
        sceneUuid: existingScene.sceneUuid
      };
    }
  } catch (error) {
    console.error('Error creating group:', error.message);
    throw error;
  }
}

async function addSourceToGroup(groupName, sourceName, url) {
  try {
    const obsClient = await getOBSClient();
    
    // Ensure group exists
    await createGroupIfNotExists(groupName);
    
    // Check if source already exists in the group
    const { sceneItems } = await obsClient.call('GetSceneItemList', { sceneName: groupName });
    const sourceExists = sceneItems.some(item => item.sourceName === sourceName);
    
    if (!sourceExists) {
      // Create the browser source in the group
      console.log(`Adding source "${sourceName}" to group "${groupName}"`);
      await obsClient.call('CreateInput', {
        sceneName: groupName,
        inputName: sourceName,
        inputKind: 'browser_source',
        inputSettings: {
          width: 1600,
          height: 900,
          url,
          control_audio: true,
        },
      });
      
      // Ensure audio control is enabled
      await obsClient.call('SetInputSettings', {
        inputName: sourceName,
        inputSettings: {
          control_audio: true,
        },
        overlay: true,
      });
      
      console.log(`Source "${sourceName}" successfully added to group "${groupName}"`);
      return { success: true, message: `Source added to group successfully` };
    } else {
      console.log(`Source "${sourceName}" already exists in group "${groupName}"`);
      return { success: false, message: `Source already exists in group` };
    }
  } catch (error) {
    console.error('Error adding source to group:', error.message);
    throw error;
  }
}

async function getAvailableTextInputKind() {
  try {
    const obsClient = await getOBSClient();
    const { inputKinds } = await obsClient.call('GetInputKindList');
    
    console.log('Available input kinds:', inputKinds);
    
    // Check for text input kinds in order of preference
    const textKinds = ['text_gdiplus_v2', 'text_gdiplus', 'text_ft2_source_v2', 'text_ft2_source', 'text_source'];
    
    for (const kind of textKinds) {
      if (inputKinds.includes(kind)) {
        console.log(`Found text input kind: ${kind}`);
        return kind;
      }
    }
    
    // Fallback - find any input kind that contains 'text'
    const textKind = inputKinds.find(kind => kind.toLowerCase().includes('text'));
    if (textKind) {
      console.log(`Found fallback text input kind: ${textKind}`);
      return textKind;
    }
    
    throw new Error('No text input kind found');
  } catch (error) {
    console.error('Error getting available input kinds:', error.message);
    throw error;
  }
}

async function createTextSource(sceneName, textSourceName, text) {
  try {
    const obsClient = await getOBSClient();
    
    // Check if text source already exists globally in OBS
    const { inputs } = await obsClient.call('GetInputList');
    const existingInput = inputs.find(input => input.inputName === textSourceName);
    
    if (!existingInput) {
      console.log(`Creating text source "${textSourceName}" in scene "${sceneName}"`);
      
      // Get the correct text input kind for this OBS installation
      const inputKind = await getAvailableTextInputKind();
      
      const inputSettings = {
        text,
        font: {
          face: 'Arial',
          size: 72,
          style: 'Bold'
        },
        color: 0xFFFFFFFF, // White text
        outline: true,
        outline_color: 0xFF000000, // Black outline
        outline_size: 4
      };
      
      await obsClient.call('CreateInput', {
        sceneName,
        inputName: textSourceName,
        inputKind,
        inputSettings
      });
      
      console.log(`Text source "${textSourceName}" created successfully with kind "${inputKind}"`);
      return { success: true, message: 'Text source created successfully' };
    } else {
      console.log(`Text source "${textSourceName}" already exists globally, updating settings`);
      
      // Update existing text source settings
      const inputSettings = {
        text,
        font: {
          face: 'Arial',
          size: 72,
          style: 'Bold'
        },
        color: 0xFFFFFFFF, // White text
        outline: true,
        outline_color: 0xFF000000, // Black outline
        outline_size: 4
      };
      
      await obsClient.call('SetInputSettings', {
        inputName: textSourceName,
        inputSettings
      });
      
      console.log(`Text source "${textSourceName}" settings updated`);
      return { success: true, message: 'Text source settings updated' };
    }
  } catch (error) {
    console.error('Error creating text source:', error.message);
    throw error;
  }
}

async function createStreamGroup(groupName, streamName, teamName, url) {
  try {
    const obsClient = await getOBSClient();
    
    // Ensure team scene exists
    await createGroupIfNotExists(groupName);
    
    const streamGroupName = `${streamName.toLowerCase().replace(/\s+/g, '_')}_stream`;
    const sourceName = streamName.toLowerCase().replace(/\s+/g, '_') + '_twitch';
    const textSourceName = teamName.toLowerCase().replace(/\s+/g, '_') + '_text';
    
    // Create a nested scene for this stream (acts as a group)
    try {
      await obsClient.call('CreateScene', { sceneName: streamGroupName });
      console.log(`Created nested scene "${streamGroupName}" for stream grouping`);
    } catch (sceneError) {
      console.log(`Nested scene "${streamGroupName}" might already exist`);
    }
    
    // Create text source globally (reused across streams in the team)
    await createTextSource(groupName, textSourceName, teamName);
    
    // Create browser source globally
    const { inputs } = await obsClient.call('GetInputList');
    const browserSourceExists = inputs.some(input => input.inputName === sourceName);
    
    if (!browserSourceExists) {
      await obsClient.call('CreateInput', {
        sceneName: streamGroupName, // Create in the nested scene
        inputName: sourceName,
        inputKind: 'browser_source',
        inputSettings: {
          width: 1600,
          height: 900,
          url,
          control_audio: true,
        },
      });
      console.log(`Created browser source "${sourceName}" in nested scene`);
    } else {
      // Add existing source to nested scene
      await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: sourceName
      });
    }
    
    // Add text source to nested scene
    try {
      await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: textSourceName
      });
    } catch (e) {
      console.log('Text source might already be in nested scene');
    }
    
    // Get the scene items in the nested scene
    const { sceneItems: nestedSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
    
    // Find the browser source and text source items in nested scene
    const browserSourceItem = nestedSceneItems.find(item => item.sourceName === sourceName);
    const textSourceItem = nestedSceneItems.find(item => item.sourceName === textSourceName);
    
    // Position the sources properly in the nested scene
    if (browserSourceItem && textSourceItem) {
      try {
        // Position text overlay at top-left of the browser source
        await obsClient.call('SetSceneItemTransform', {
          sceneName: streamGroupName, // In the nested scene
          sceneItemId: textSourceItem.sceneItemId,
          sceneItemTransform: {
            positionX: 10,
            positionY: 10,
            scaleX: 1.0,
            scaleY: 1.0
          }
        });
        
        console.log(`Stream sources positioned in nested scene "${streamGroupName}"`);
      } catch (positionError) {
        console.error('Failed to position sources:', positionError.message || positionError);
      }
    }
    
    // Now add the nested scene to the team scene as a group
    const { sceneItems: teamSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: groupName });
    const nestedSceneInTeam = teamSceneItems.some(item => item.sourceName === streamGroupName);
    
    if (!nestedSceneInTeam) {
      try {
        await obsClient.call('CreateSceneItem', {
          sceneName: groupName,
          sourceName: streamGroupName,
          sceneItemEnabled: true
        });
        console.log(`Added nested scene "${streamGroupName}" to team scene "${groupName}"`);
      } catch (e) {
        console.error('Failed to add nested scene to team scene:', e.message);
      }
    }
    
    console.log(`Stream group "${streamGroupName}" created as nested scene in team "${groupName}"`);
    return { 
      success: true, 
      message: 'Stream group created as nested scene',
      streamGroupName,
      sourceName,
      textSourceName
    };
  } catch (error) {
    console.error('Error creating stream group:', error.message);
    throw error;
  }
}


// Export all functions
module.exports = { 
  connectToOBS, 
  getOBSClient, 
  disconnectFromOBS, 
  addSourceToSwitcher, 
  ensureConnected,
  getConnectionStatus,
  createGroupIfNotExists,
  addSourceToGroup,
  createTextSource,
  createStreamGroup,
  getAvailableTextInputKind
};