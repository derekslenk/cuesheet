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
    
    const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
    const cleanStreamName = streamName.toLowerCase().replace(/\s+/g, '_');
    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
    const sourceName = `${cleanGroupName}_${cleanStreamName}`;
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
          width: 1920,
          height: 1080,
          url,
          control_audio: true,
        },
      });
      console.log(`Created browser source "${sourceName}" in nested scene`);
      
      // Mute the audio stream for the browser source
      try {
        await obsClient.call('SetInputMute', {
          inputName: sourceName,
          inputMuted: true
        });
        console.log(`Muted audio for browser source "${sourceName}"`);
      } catch (muteError) {
        console.error(`Failed to mute audio for "${sourceName}":`, muteError.message);
      }
    } else {
      // Add existing source to nested scene
      await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: sourceName
      });
      
      // Ensure audio is muted for existing source too
      try {
        await obsClient.call('SetInputMute', {
          inputName: sourceName,
          inputMuted: true
        });
        console.log(`Ensured audio is muted for existing browser source "${sourceName}"`);
      } catch (muteError) {
        console.error(`Failed to mute audio for existing source "${sourceName}":`, muteError.message);
      }
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
        // Position text overlay at top, then center horizontally
        await obsClient.call('SetSceneItemTransform', {
          sceneName: streamGroupName, // In the nested scene
          sceneItemId: textSourceItem.sceneItemId,
          sceneItemTransform: {
            positionX: 0,   // Start at left
            positionY: 10,  // Keep at top
            scaleX: 1.0,
            scaleY: 1.0,
            alignment: 5    // Center alignment
          }
        });
        
        // Apply center horizontally transform (like clicking "Center Horizontally" in OBS UI)
        const { sceneItemTransform: currentTransform } = await obsClient.call('GetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: textSourceItem.sceneItemId
        });
        
        console.log('Current text transform before centering:', JSON.stringify(currentTransform, null, 2));
        
        // Get the actual scene dimensions
        let sceneWidth = 1920; // Default assumption
        let sceneHeight = 1080;
        
        try {
          const sceneInfo = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
          console.log(`Scene dimensions check for "${streamGroupName}":`, sceneInfo);
        } catch (e) {
          console.log('Could not get scene info:', e.message);
        }
        
        // Manual positioning: Calculate where to place text so its center is at canvas center
        const canvasWidth = sceneWidth;
        const canvasCenter = canvasWidth / 2;
        const textWidth = currentTransform.width || currentTransform.sourceWidth || 0;
        
        // Since we know the scene is bounded to 1600x900 from earlier logs, try that
        const boundedWidth = 1600;
        const boundedCenter = boundedWidth / 2; // 800
        const alternatePosition = boundedCenter - (textWidth / 2);
        
        console.log(`Manual centering calculation:`);
        console.log(`- Scene/Canvas width: ${canvasWidth}`);
        console.log(`- Canvas center: ${canvasCenter}`);
        console.log(`- Text width: ${textWidth}`);
        console.log(`- Position for 1920px canvas: ${canvasCenter - (textWidth / 2)}`);
        console.log(`- Bounded scene width: ${boundedWidth}`);
        console.log(`- Bounded center: ${boundedCenter}`);
        console.log(`- Position for 1600px bounded scene: ${alternatePosition}`);
        
        // Set the position with left alignment (0) for predictable positioning
        await obsClient.call('SetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: textSourceItem.sceneItemId,
          sceneItemTransform: {
            positionX: alternatePosition,                 // Use 1600px scene width calculation
            positionY: 10,                                // Keep at top
            alignment: 0,                                 // Left alignment for predictable positioning
            rotation: currentTransform.rotation || 0,
            scaleX: currentTransform.scaleX || 1,
            scaleY: currentTransform.scaleY || 1,
            cropBottom: currentTransform.cropBottom || 0,
            cropLeft: currentTransform.cropLeft || 0,
            cropRight: currentTransform.cropRight || 0,
            cropTop: currentTransform.cropTop || 0,
            cropToBounds: currentTransform.cropToBounds || false
          }
        });
        
        // Log the final transform to verify
        const { sceneItemTransform: finalTransform } = await obsClient.call('GetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: textSourceItem.sceneItemId
        });
        console.log('Final text transform after centering:', JSON.stringify(finalTransform, null, 2));
        
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
        const { sceneItemId } = await obsClient.call('CreateSceneItem', {
          sceneName: groupName,
          sourceName: streamGroupName,
          sceneItemEnabled: true
        });
        console.log(`Added nested scene "${streamGroupName}" to team scene "${groupName}"`);
        
        // Set bounds to 1600x900 to match the source switcher dimensions
        await obsClient.call('SetSceneItemTransform', {
          sceneName: groupName,
          sceneItemId: sceneItemId,
          sceneItemTransform: {
            alignment: 5, // Center alignment
            boundsAlignment: 0, // Center bounds alignment
            boundsType: 'OBS_BOUNDS_SCALE_INNER', // Scale to fit inside bounds
            boundsWidth: 1600,
            boundsHeight: 900,
            scaleX: 1.0,
            scaleY: 1.0
          }
        });
        console.log(`Set bounds for nested scene to 1600x900`);
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

// Comprehensive stream deletion function
async function deleteStreamComponents(streamName, teamName, groupName) {
  try {
    const obsClient = await getOBSClient();
    
    const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
    const cleanStreamName = streamName.toLowerCase().replace(/\s+/g, '_');
    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
    const sourceName = `${cleanGroupName}_${cleanStreamName}`;
    const textSourceName = teamName.toLowerCase().replace(/\s+/g, '_') + '_text';
    
    console.log(`Starting comprehensive deletion for stream "${streamName}"`);
    console.log(`Components to delete: scene="${streamGroupName}", source="${sourceName}"`);
    
    // 1. Remove stream group scene item from team scene (if it exists)
    try {
      const { sceneItems: teamSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: groupName });
      const streamGroupItem = teamSceneItems.find(item => item.sourceName === streamGroupName);
      
      if (streamGroupItem) {
        await obsClient.call('RemoveSceneItem', {
          sceneName: groupName,
          sceneItemId: streamGroupItem.sceneItemId
        });
        console.log(`Removed stream group "${streamGroupName}" from team scene "${groupName}"`);
      }
    } catch (error) {
      console.log(`Team scene "${groupName}" not found or stream group not in it:`, error.message);
    }
    
    // 2. Remove the nested scene (stream group)
    try {
      await obsClient.call('RemoveScene', { sceneName: streamGroupName });
      console.log(`Removed nested scene "${streamGroupName}"`);
    } catch (error) {
      console.log(`Nested scene "${streamGroupName}" not found:`, error.message);
    }
    
    // 3. Remove the browser source (if it's not used elsewhere)
    try {
      const { inputs } = await obsClient.call('GetInputList');
      const browserSource = inputs.find(input => input.inputName === sourceName);
      
      if (browserSource) {
        await obsClient.call('RemoveInput', { inputUuid: browserSource.inputUuid });
        console.log(`Removed browser source "${sourceName}"`);
      }
    } catch (error) {
      console.log(`Browser source "${sourceName}" not found:`, error.message);
    }
    
    // 4. Check if text source should be removed (only if no other streams from this team exist)
    try {
      // This would require checking if other streams from the same team exist
      // For now, we'll leave the text source as it's shared across team streams
      console.log(`Keeping shared text source "${textSourceName}" (shared across team streams)`);
    } catch (error) {
      console.log(`Error checking text source usage:`, error.message);
    }
    
    // 5. Remove from all source switchers
    const screens = [
      'ss_large',
      'ss_left', 
      'ss_right',
      'ss_top_left',
      'ss_top_right',
      'ss_bottom_left',
      'ss_bottom_right'
    ];
    
    for (const screen of screens) {
      try {
        await removeSourceFromSwitcher(screen, streamGroupName);
        console.log(`Removed "${streamGroupName}" from ${screen}`);
      } catch (error) {
        console.log(`Error removing from ${screen}:`, error.message);
      }
    }
    
    console.log(`Comprehensive deletion completed for stream "${streamName}"`);
    return { 
      success: true, 
      message: 'Stream components deleted successfully',
      deletedComponents: {
        streamGroupName,
        sourceName,
        removedFromSwitchers: screens.length
      }
    };
  } catch (error) {
    console.error('Error in comprehensive stream deletion:', error.message);
    throw error;
  }
}

// Helper function to remove source from source switcher
async function removeSourceFromSwitcher(switcherName, sourceName) {
  try {
    const obsClient = await getOBSClient();
    
    // Get current source switcher options
    const { inputSettings } = await obsClient.call('GetInputSettings', { inputName: switcherName });
    const currentSources = inputSettings.sources || [];
    
    // Filter out the source we want to remove
    const updatedSources = currentSources.filter(source => source.value !== sourceName);
    
    // Update the source switcher if changes were made
    if (updatedSources.length !== currentSources.length) {
      await obsClient.call('SetInputSettings', {
        inputName: switcherName,
        inputSettings: {
          ...inputSettings,
          sources: updatedSources
        }
      });
      console.log(`Removed "${sourceName}" from ${switcherName} (${currentSources.length - updatedSources.length} instances)`);
    } else {
      console.log(`Source "${sourceName}" not found in ${switcherName}`);
    }
  } catch (error) {
    console.error(`Error removing source from ${switcherName}:`, error.message);
    throw error;
  }
}

// Function to clear text files that reference the deleted stream
async function clearTextFilesForStream(streamGroupName) {
  const fs = require('fs');
  const path = require('path');
  
  try {
    const FILE_DIRECTORY = path.resolve(process.env.FILE_DIRECTORY || './files');
    const screens = [
      'large',
      'left', 
      'right',
      'topLeft',
      'topRight',
      'bottomLeft',
      'bottomRight'
    ];
    
    let clearedFiles = [];
    
    for (const screen of screens) {
      try {
        const filePath = path.join(FILE_DIRECTORY, `${screen}.txt`);
        
        // Check if file exists and read its content
        if (fs.existsSync(filePath)) {
          const currentContent = fs.readFileSync(filePath, 'utf8').trim();
          
          // If the file contains the stream group name we're deleting, clear it
          if (currentContent === streamGroupName) {
            fs.writeFileSync(filePath, '');
            clearedFiles.push(screen);
            console.log(`Cleared ${screen}.txt (was referencing deleted stream "${streamGroupName}")`);
          }
        }
      } catch (error) {
        console.log(`Error checking/clearing ${screen}.txt:`, error.message);
      }
    }
    
    return {
      success: true,
      clearedFiles,
      message: `Cleared ${clearedFiles.length} text files that referenced the deleted stream`
    };
  } catch (error) {
    console.error('Error clearing text files:', error.message);
    throw error;
  }
}


// Comprehensive team deletion function
async function deleteTeamComponents(teamName, groupName) {
  try {
    const obsClient = await getOBSClient();
    
    console.log(`Starting comprehensive deletion for team "${teamName}"`);
    
    // 1. Delete the team scene (group)
    if (groupName) {
      try {
        await obsClient.call('RemoveScene', { sceneName: groupName });
        console.log(`Removed team scene "${groupName}"`);
      } catch (error) {
        console.log(`Team scene "${groupName}" not found or already deleted:`, error.message);
      }
    }
    
    // 2. Delete the team text source (shared across all team streams)
    const textSourceName = teamName.toLowerCase().replace(/\s+/g, '_') + '_text';
    try {
      const { inputs } = await obsClient.call('GetInputList');
      const textSource = inputs.find(input => input.inputName === textSourceName);
      
      if (textSource) {
        await obsClient.call('RemoveInput', { inputUuid: textSource.inputUuid });
        console.log(`Removed team text source "${textSourceName}"`);
      }
    } catch (error) {
      console.log(`Text source "${textSourceName}" not found:`, error.message);
    }
    
    // 3. Get all scenes to check for nested stream scenes
    try {
      const { scenes } = await obsClient.call('GetSceneList');
      const cleanGroupName = (groupName || teamName).toLowerCase().replace(/\s+/g, '_');
      
      // Find all nested stream scenes for this team
      const streamScenes = scenes.filter(scene => 
        scene.sceneName.startsWith(`${cleanGroupName}_`) && 
        scene.sceneName.endsWith('_stream')
      );
      
      console.log(`Found ${streamScenes.length} stream scenes to delete`);
      
      // Delete each stream scene
      for (const streamScene of streamScenes) {
        try {
          await obsClient.call('RemoveScene', { sceneName: streamScene.sceneName });
          console.log(`Removed stream scene "${streamScene.sceneName}"`);
        } catch (error) {
          console.log(`Error removing stream scene "${streamScene.sceneName}":`, error.message);
        }
      }
    } catch (error) {
      console.log(`Error finding stream scenes:`, error.message);
    }
    
    // 4. Remove any browser sources associated with this team
    try {
      const { inputs } = await obsClient.call('GetInputList');
      const cleanGroupName = (groupName || teamName).toLowerCase().replace(/\s+/g, '_');
      
      // Find all browser sources for this team
      const teamBrowserSources = inputs.filter(input => 
        input.inputKind === 'browser_source' && 
        input.inputName.startsWith(`${cleanGroupName}_`)
      );
      
      console.log(`Found ${teamBrowserSources.length} browser sources to delete`);
      
      // Delete each browser source
      for (const source of teamBrowserSources) {
        try {
          await obsClient.call('RemoveInput', { inputUuid: source.inputUuid });
          console.log(`Removed browser source "${source.inputName}"`);
        } catch (error) {
          console.log(`Error removing browser source "${source.inputName}":`, error.message);
        }
      }
    } catch (error) {
      console.log(`Error finding browser sources:`, error.message);
    }
    
    console.log(`Comprehensive team deletion completed for "${teamName}"`);
    return {
      success: true,
      message: 'Team components deleted successfully',
      deletedComponents: {
        teamScene: groupName,
        textSource: textSourceName
      }
    };
  } catch (error) {
    console.error('Error in comprehensive team deletion:', error.message);
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
  getAvailableTextInputKind,
  deleteStreamComponents,
  removeSourceFromSwitcher,
  clearTextFilesForStream,
  deleteTeamComponents
};