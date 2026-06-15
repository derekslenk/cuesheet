const { OBSWebSocket } = require('obs-websocket-js');
const { cleanObsName, SOURCE_SWITCHER_NAMES, SCREEN_POSITIONS } = require('./constants');
const { createStreamInput, applyFfmpegPlaybackSettings } = require('./streamInputConfig');
const {
  labelRenderer,
  labelShutdownWhenHidden,
  labelOverlayUrl,
  streamLabelInputName,
  isLegacyTeamLabelInputName,
  createStreamLabelBrowserSource,
} = require('./streamLabel');
const {
  PLATE_COLOR,
  ACCENT_COLOR,
  ACCENT_WIDTH,
  PLATE_TOP_Y,
  buildTeamTextSettings,
  buildNameTextSettings,
  computeUnifiedPlateLayout,
} = require('./labelLayout');

let obs = null;
let isConnecting = false;
let connectionPromise = null;

// Pace bulk obs-websocket mutations. Firing many RemoveScene/RemoveInput calls
// back-to-back (e.g. deleting a team with dozens of streams) floods obs-websocket
// and can CRASH OBS — observed tearing down 40 warm sources. A short gap lets OBS
// release each source's decoder/VRAM before the next removal.
const OBS_BULK_PACE_MS = 120;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    const colorSourceName = `${textSourceName}_bg`;
    
    if (!existingInput) {
      console.log(`Creating text source "${textSourceName}" with color background in scene "${sceneName}"`);
      
      // First, create a color source for the background
      const colorSourceExists = inputs.some(input => input.inputName === colorSourceName);
      
      if (!colorSourceExists) {
        console.log(`Creating color source background "${colorSourceName}"`);
        await obsClient.call('CreateInput', {
          sceneName,
          inputName: colorSourceName,
          inputKind: 'color_source_v3', // Use v3 if available, fallback handled below
          inputSettings: {
            color: 0xFF4B2B00, // Background color #002b4b in ABGR format
            width: 800,  // Width to accommodate text
            height: 100  // Height for text background
          }
        }).catch(async (error) => {
          // If v3 doesn't exist, try v2
          console.log('color_source_v3 failed, trying color_source_v2:', error.message);
          await obsClient.call('CreateInput', {
            sceneName,
            inputName: colorSourceName,
            inputKind: 'color_source_v2',
            inputSettings: {
              color: 0xFF4B2B00,
              width: 800,
              height: 100
            }
          }).catch(async (fallbackError) => {
            // Final fallback to basic color_source
            console.log('color_source_v2 failed, trying color_source:', fallbackError.message);
            await obsClient.call('CreateInput', {
              sceneName,
              inputName: colorSourceName,
              inputKind: 'color_source',
              inputSettings: {
                color: 0xFF4B2B00,
                width: 800,
                height: 100
              }
            });
          });
        });
        console.log(`Created color source background "${colorSourceName}"`);
      }
      
      // Get the correct text input kind for this OBS installation
      const inputKind = await getAvailableTextInputKind();
      
      // Create text source with simple settings (no background needed)
      const inputSettings = {
        text,
        font: {
          face: 'Arial',
          size: 96,
          style: 'Bold'
        },
        color: 0xFFFFFFFF, // White text
        outline: true,
        outline_color: 0xFF000000, // Black outline
        outline_size: 2
      };
      
      console.log(`Creating text source with inputKind: ${inputKind}`);
      console.log('Input settings:', JSON.stringify(inputSettings, null, 2));
      
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
          size: 96,
          style: 'Bold'
        },
        color: 0xFFFFFFFF, // White text
        outline: true,
        outline_color: 0xFF000000, // Black outline
        outline_size: 4,
        bk_color: 0xFF4B2B00, // Background color #002b4b in ABGR format
        bk_opacity: 255 // Full opacity background
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

async function createStreamGroup(groupName, streamName, teamName, url, lockSources = true) {
  try {
    const obsClient = await getOBSClient();
    
    // Ensure team scene exists
    await createGroupIfNotExists(groupName);
    
    const cleanGroupName = cleanObsName(groupName);
    const cleanStreamName = cleanObsName(streamName);
    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
    const sourceName = `${cleanGroupName}_${cleanStreamName}`;
    const textSourceName = cleanObsName(teamName) + '_text';
    
    // Create a nested scene for this stream (acts as a group)
    try {
      await obsClient.call('CreateScene', { sceneName: streamGroupName });
      console.log(`Created nested scene "${streamGroupName}" for stream grouping`);
    } catch {
      console.log(`Nested scene "${streamGroupName}" might already exist`);
    }
    
    // Create text source globally (reused across streams in the team)
    await createTextSource(groupName, textSourceName, teamName);
    
    // Create browser source globally
    const { inputs } = await obsClient.call('GetInputList');
    const browserSourceExists = inputs.some(input => input.inputName === sourceName);
    
    if (!browserSourceExists) {
      // Create browser source with detailed audio control settings
      console.log(`Creating browser source "${sourceName}" with URL: ${url}`);
      await obsClient.call('CreateInput', {
        sceneName: streamGroupName, // Create in the nested scene
        inputName: sourceName,
        inputKind: 'browser_source',
        inputSettings: {
          width: 1920,
          height: 1080,
          url,
          control_audio: true, // Enable audio control so OBS can mute the browser source
          restart_when_active: false,
          shutdown: false,
          // Try additional audio-related settings
          reroute_audio: true,
          audio_monitoring_type: 0 // Monitor Off
        },
      });
      console.log(`Created browser source "${sourceName}" in nested scene with URL: ${url}`);
      
      // Apply additional settings after creation to ensure they stick
      try {
        await obsClient.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: {
            width: 1920,
            height: 1080,
            url, // Make sure URL is preserved
            control_audio: true,
            reroute_audio: true,
            restart_when_active: false,
            shutdown: false,
            audio_monitoring_type: 0
          },
          overlay: false // Don't overlay, replace all settings
        });
        console.log(`Applied complete settings to "${sourceName}" with URL: ${url}`);
      } catch (settingsError) {
        console.error(`Failed to apply settings to "${sourceName}":`, settingsError.message);
      }
      
      // Mute the browser source audio by default (can be unmuted individually in OBS)
      try {
        await obsClient.call('SetInputMute', {
          inputName: sourceName,
          inputMuted: true
        });
        console.log(`Muted browser source audio for "${sourceName}" (can be unmuted in OBS for individual control)`);
      } catch (muteError) {
        console.error(`Failed to mute browser source audio for "${sourceName}":`, muteError.message);
      }
      
      // Lock the newly created browser source if requested
      if (lockSources) {
        try {
          // Get the scene items to find the browser source's ID
          const { sceneItems } = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
          const browserItem = sceneItems.find(item => item.sourceName === sourceName);
          
          if (browserItem) {
            await obsClient.call('SetSceneItemLocked', {
              sceneName: streamGroupName,
              sceneItemId: browserItem.sceneItemId,
              sceneItemLocked: true
            });
            console.log(`Locked browser source "${sourceName}" in nested scene`);
          }
        } catch (lockError) {
          console.error(`Failed to lock browser source "${sourceName}":`, lockError.message);
        }
      }
    } else {
      // Add existing source to nested scene
      const { sceneItemId } = await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: sourceName
      });
      console.log(`Added existing browser source "${sourceName}" to nested scene`);
      
      // Lock the scene item if requested
      if (lockSources) {
        try {
          await obsClient.call('SetSceneItemLocked', {
            sceneName: streamGroupName,
            sceneItemId: sceneItemId,
            sceneItemLocked: true
          });
          console.log(`Locked browser source "${sourceName}" in nested scene`);
        } catch (lockError) {
          console.error(`Failed to lock browser source "${sourceName}":`, lockError.message);
        }
      }
      
      // Ensure existing browser source has audio control enabled and correct URL
      try {
        await obsClient.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings: {
            width: 1920,
            height: 1080,
            url, // Update URL in case it changed
            control_audio: true,
            reroute_audio: true,
            restart_when_active: false,
            shutdown: false,
            audio_monitoring_type: 0
          },
          overlay: false // Replace settings, don't overlay
        });
        
        await obsClient.call('SetInputMute', {
          inputName: sourceName,
          inputMuted: true
        });
        console.log(`Updated existing browser source "${sourceName}" with URL: ${url} and enabled audio control`);
      } catch (settingsError) {
        console.error(`Failed to update settings for existing source "${sourceName}":`, settingsError.message);
      }
    }
    
    // Add text source and its background to nested scene
    const colorSourceName = `${textSourceName}_bg`;
    
    try {
      const { sceneItemId: colorItemId } = await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: colorSourceName
      });
      console.log(`Added color source background "${colorSourceName}" to nested scene`);
      
      // Lock the color source if requested
      if (lockSources) {
        try {
          await obsClient.call('SetSceneItemLocked', {
            sceneName: streamGroupName,
            sceneItemId: colorItemId,
            sceneItemLocked: true
          });
          console.log(`Locked color source background "${colorSourceName}"`);
        } catch (lockError) {
          console.error(`Failed to lock color source:`, lockError.message);
        }
      }
    } catch {
      console.log('Color source background might already be in nested scene');
    }
    
    try {
      const { sceneItemId: textItemId } = await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName: textSourceName
      });
      console.log(`Added text source "${textSourceName}" to nested scene`);
      
      // Lock the text source if requested
      if (lockSources) {
        try {
          await obsClient.call('SetSceneItemLocked', {
            sceneName: streamGroupName,
            sceneItemId: textItemId,
            sceneItemLocked: true
          });
          console.log(`Locked text source "${textSourceName}"`);
        } catch (lockError) {
          console.error(`Failed to lock text source:`, lockError.message);
        }
      }
    } catch {
      console.log('Text source might already be in nested scene');
    }
    
    // Get the scene items in the nested scene
    const { sceneItems: nestedSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
    
    // Find the browser source, text source, and color background items in nested scene
    const browserSourceItem = nestedSceneItems.find(item => item.sourceName === sourceName);
    const textSourceItem = nestedSceneItems.find(item => item.sourceName === textSourceName);
    const colorSourceItem = nestedSceneItems.find(item => item.sourceName === colorSourceName);
    
    // Position the sources properly in the nested scene
    if (browserSourceItem && textSourceItem && colorSourceItem) {
      try {
        // Position text overlay centered horizontally using center alignment
        await obsClient.call('SetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: textSourceItem.sceneItemId,
          sceneItemTransform: {
            positionX: 960, // Center of 1920px canvas
            positionY: 50,  // Move down from top
            scaleX: 1.0,
            scaleY: 1.0,
            alignment: 0    // Center alignment (0 = center, 1 = left, 2 = right)
          }
        });
        
        // Get the actual text width after positioning
        const { sceneItemTransform: textTransform } = await obsClient.call('GetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: textSourceItem.sceneItemId
        });
        
        const actualTextWidth = textTransform.width || textTransform.sourceWidth || (teamName.length * 40);
        console.log('Actual text width:', actualTextWidth);
        
        // Calculate color source width with padding
        const colorSourceWidth = Math.max(actualTextWidth + 40, 200); // Add 40px padding, minimum 200px
        console.log('Color source width:', colorSourceWidth);
        
        // Adjust the color source settings to match the text's actual width and height
        await obsClient.call('SetInputSettings', {
          inputName: colorSourceName,
          inputSettings: {
            width: Math.floor(colorSourceWidth), // Ensure it's a whole number
            height: 90  // Slightly shorter height to better match text
          }
        });

        // Position color source background centered, same position as text
        await obsClient.call('SetSceneItemTransform', {
          sceneName: streamGroupName,
          sceneItemId: colorSourceItem.sceneItemId,
          sceneItemTransform: {
            positionX: 960,  // Same center position as text
            positionY: 50,   // Same Y position as text for perfect alignment
            scaleX: 1.0,
            scaleY: 1.0,
            alignment: 0     // Same center alignment as text
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

// Color-source kind preference chain, newest first (matches createTextSource's
// inline fallback for older OBS builds).
const COLOR_SOURCE_KINDS = ['color_source_v3', 'color_source_v2', 'color_source'];

// Create or restyle the shared per-team label text input. Created in the team
// scene so it exists independently of any one stream scene; styling is
// re-applied on every call so V2 stays the single owner of the label look.
async function ensureTeamLabelText(obsClient, groupName, textSourceName, teamName) {
  const { inputs } = await obsClient.call('GetInputList');
  const inputSettings = buildTeamTextSettings(teamName);
  if (inputs.some(input => input.inputName === textSourceName)) {
    await obsClient.call('SetInputSettings', { inputName: textSourceName, inputSettings });
    return;
  }
  const inputKind = await getAvailableTextInputKind();
  await obsClient.call('CreateInput', {
    sceneName: groupName,
    inputName: textSourceName,
    inputKind,
    inputSettings,
  });
  console.log(`[V2] Created team label text "${textSourceName}" (${inputKind})`);
}

// Ensure one of a stream's label inputs (plate box, accent bar, streamer text)
// exists with `inputSettings` applied and has an item in the stream scene.
// CreateInput both creates the input and adds the scene item; on re-adds the
// input may already exist, so settings are re-applied and the item re-created.
async function ensureStreamLabelInput(obsClient, sceneName, inputName, kinds, inputSettings) {
  const { inputs } = await obsClient.call('GetInputList');
  if (!inputs.some(input => input.inputName === inputName)) {
    let lastError;
    for (const inputKind of kinds) {
      try {
        await obsClient.call('CreateInput', { sceneName, inputName, inputKind, inputSettings });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }
  await obsClient.call('SetInputSettings', { inputName, inputSettings });
  const { sceneItems } = await obsClient.call('GetSceneItemList', { sceneName });
  if (!sceneItems.some(item => item.sourceName === inputName)) {
    await obsClient.call('CreateSceneItem', { sceneName, sourceName: inputName });
  }
}

// Poll GetSceneItemTransform until the text source reports the same non-zero
// sourceWidth on two consecutive reads. Mid-rasterization OBS can briefly
// report transient partial sizes (observed sourceHeight 4 for a 543×95 label),
// so "first non-zero" is not trustworthy. Returns 0 if the width never
// settles, making the plate layout fall back to its font-metric estimate.
async function measureTextWidth(obsClient, sceneName, sceneItemId) {
  let previousWidth = -1;
  for (let i = 0; i < 8; i++) {
    const { sceneItemTransform } = await obsClient.call('GetSceneItemTransform', {
      sceneName,
      sceneItemId,
    });
    const width = sceneItemTransform.sourceWidth || 0;
    if (width > 0 && width === previousWidth) return width;
    previousWidth = width;
    await sleep(100);
  }
  return 0;
}

// Phase 1.1 — Parallel to createStreamGroup. Supports useFfmpegSource to
// switch input kind between browser_source (V1 parity) and ffmpeg_source
// (Media Source backed by Streamlink). V1 remains untouched as the rollback
// target; flip `useFfmpegSource:false` to fall back per-stream.
async function createStreamGroupV2(groupName, streamName, teamName, url, opts = {}) {
  const { useFfmpegSource = false, lockSources = true, streamId } = opts;

  try {
    const obsClient = await getOBSClient();

    await createGroupIfNotExists(groupName);

    const cleanGroupName = cleanObsName(groupName);
    const cleanStreamName = cleanObsName(streamName);
    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
    const sourceName = `${cleanGroupName}_${cleanStreamName}`;
    const textSourceName = cleanObsName(teamName) + '_text';
    // Per-stream streamer label (shown beneath the shared team label so each
    // source self-identifies). Unique per stream, unlike the shared team text.
    const nameTextSourceName = `${cleanGroupName}_${cleanStreamName}_name_text`;
    const nameColorSourceName = `${nameTextSourceName}_bg`;
    // Per-stream label chrome. The team TEXT input is shared per team, but its
    // background must be per-stream: the unified plate matches each scene's
    // streamer-name width, and one shared color source can only have one width.
    const teamBgSourceName = `${cleanGroupName}_${cleanStreamName}_team_bg`;
    const accentSourceName = `${cleanGroupName}_${cleanStreamName}_accent`;

    try {
      await obsClient.call('CreateScene', { sceneName: streamGroupName });
      console.log(`[V2] Created nested scene "${streamGroupName}"`);
    } catch {
      console.log(`[V2] Nested scene "${streamGroupName}" might already exist`);
    }

    // V2 owns the team-label text styling (createTextSource is V1's helper and
    // resets the style on every re-add). The input is shared per team and lives
    // in the team scene; each stream scene references it via CreateSceneItem.
    // Only the OBS-native renderer uses it — the HTML overlay draws the team
    // name itself, so it skips the shared text input entirely.
    if (labelRenderer() === 'obs') {
      await ensureTeamLabelText(obsClient, groupName, textSourceName, teamName);
    }

    const { inputs } = await obsClient.call('GetInputList');
    const sourceExists = inputs.some(input => input.inputName === sourceName);

    if (!sourceExists) {
      console.log(`[V2] Creating ${useFfmpegSource ? 'ffmpeg_source' : 'browser_source'} "${sourceName}" with URL: ${url}`);
      await createStreamInput(
        { call: obsClient.call.bind(obsClient) },
        { sceneName: streamGroupName, inputName: sourceName, url, useFfmpegSource }
      );

      if (lockSources) {
        try {
          const { sceneItems } = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
          const sourceItem = sceneItems.find(item => item.sourceName === sourceName);
          if (sourceItem) {
            await obsClient.call('SetSceneItemLocked', {
              sceneName: streamGroupName,
              sceneItemId: sourceItem.sceneItemId,
              sceneItemLocked: true,
            });
          }
        } catch (lockError) {
          console.error(`[V2] Failed to lock "${sourceName}":`, lockError.message);
        }
      }
    } else {
      const { sceneItemId } = await obsClient.call('CreateSceneItem', {
        sceneName: streamGroupName,
        sourceName,
      });
      console.log(`[V2] Added existing source "${sourceName}" to nested scene`);

      if (lockSources) {
        try {
          await obsClient.call('SetSceneItemLocked', {
            sceneName: streamGroupName,
            sceneItemId,
            sceneItemLocked: true,
          });
        } catch (lockError) {
          console.error(`[V2] Failed to lock existing "${sourceName}":`, lockError.message);
        }
      }

      // Re-apply settings to reflect any URL change. The helper's settings are
      // the source of truth for both kinds — same shape as the initial create.
      try {
        const { buildStreamInputConfig } = require('./streamInputConfig');
        const { inputSettings } = buildStreamInputConfig({ url, useFfmpegSource });
        await obsClient.call('SetInputSettings', {
          inputName: sourceName,
          inputSettings,
          overlay: false,
        });
        // Mute both kinds — an unmuted ffmpeg_source is silent locally
        // (Monitor Off) but still broadcasts audio on the stream track.
        await obsClient.call('SetInputMute', { inputName: sourceName, inputMuted: true });
      } catch (settingsError) {
        console.error(`[V2] Failed to update settings for existing "${sourceName}":`, settingsError.message);
      }
    }

    if (labelRenderer() === 'obs') {
      // --- OBS-native 5-input label (legacy path; LABEL_RENDERER=obs) ---
      // Label chrome, bottom-to-top: plate boxes, accent bar, then the text lines
      // on top of everything. CreateInput/CreateSceneItem stack newest-above-
      // oldest, so creation order IS z-order. Sizes are placeholders until the
      // measured layout below.
      await ensureStreamLabelInput(obsClient, streamGroupName, teamBgSourceName, COLOR_SOURCE_KINDS, {
        color: PLATE_COLOR,
        width: 800,
        height: 100,
      });
      await ensureStreamLabelInput(obsClient, streamGroupName, nameColorSourceName, COLOR_SOURCE_KINDS, {
        color: PLATE_COLOR,
        width: 800,
        height: 100,
      });
      await ensureStreamLabelInput(obsClient, streamGroupName, accentSourceName, COLOR_SOURCE_KINDS, {
        color: ACCENT_COLOR,
        width: ACCENT_WIDTH,
        height: 100,
      });

      try {
        await obsClient.call('CreateSceneItem', {
          sceneName: streamGroupName,
          sourceName: textSourceName,
        });
      } catch {
        console.log('[V2] Team text might already be in nested scene');
      }

      // Streamer-name line: unique per stream (content = the stream name passed
      // to /api/addStream); styled by V2, not createTextSource.
      const textInputKind = await getAvailableTextInputKind();
      await ensureStreamLabelInput(
        obsClient, streamGroupName, nameTextSourceName, [textInputKind], buildNameTextSettings(streamName)
      );

      const { sceneItems: nestedSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: streamGroupName });
      const byName = (n) => nestedSceneItems.find(item => item.sourceName === n);
      const teamTextItem = byName(textSourceName);
      const teamBgItem = byName(teamBgSourceName);
      const nameTextItem = byName(nameTextSourceName);
      const nameBgItem = byName(nameColorSourceName);
      const accentItem = byName(accentSourceName);

      if (teamTextItem && teamBgItem && nameTextItem && nameBgItem && accentItem) {
        try {
          if (lockSources) {
            for (const { sceneItemId } of [teamTextItem, teamBgItem, nameTextItem, nameBgItem, accentItem]) {
              await obsClient.call('SetSceneItemLocked', {
                sceneName: streamGroupName,
                sceneItemId,
                sceneItemLocked: true,
              }).catch((e) => console.error('[V2] Failed to lock label item:', e.message));
            }
          }

          // Initial placement so OBS rasterizes both text sources for measuring.
          for (const { sceneItemId } of [teamTextItem, nameTextItem]) {
            await obsClient.call('SetSceneItemTransform', {
              sceneName: streamGroupName,
              sceneItemId,
              sceneItemTransform: { positionX: 960, positionY: PLATE_TOP_Y, scaleX: 1.0, scaleY: 1.0, alignment: 0 },
            });
          }

          const [teamTextWidth, nameTextWidth] = await Promise.all([
            measureTextWidth(obsClient, streamGroupName, teamTextItem.sceneItemId),
            measureTextWidth(obsClient, streamGroupName, nameTextItem.sceneItemId),
          ]);
          const layout = computeUnifiedPlateLayout({
            teamTextWidth,
            nameTextWidth,
            teamTextLength: teamName.length,
            nameTextLength: streamName.length,
          });

          await obsClient.call('SetInputSettings', {
            inputName: teamBgSourceName,
            inputSettings: { width: layout.plateWidth, height: layout.topBoxHeight },
          });
          await obsClient.call('SetInputSettings', {
            inputName: nameColorSourceName,
            inputSettings: { width: layout.plateWidth, height: layout.bottomBoxHeight },
          });
          await obsClient.call('SetInputSettings', {
            inputName: accentSourceName,
            inputSettings: { width: ACCENT_WIDTH, height: layout.plateHeight },
          });

          // Boxes anchor at their center (alignment 0), text lines at their left
          // edge vertically centered (1), the accent bar at its top-left (5).
          const placements = [
            [teamBgItem, layout.boxCenterX, layout.topBoxCenterY, 0],
            [nameBgItem, layout.boxCenterX, layout.bottomBoxCenterY, 0],
            [teamTextItem, layout.textX, layout.teamTextCenterY, 1],
            [nameTextItem, layout.textX, layout.nameTextCenterY, 1],
            [accentItem, layout.accentX, layout.accentY, 5],
          ];
          for (const [item, positionX, positionY, alignment] of placements) {
            await obsClient.call('SetSceneItemTransform', {
              sceneName: streamGroupName,
              sceneItemId: item.sceneItemId,
              sceneItemTransform: { positionX, positionY, scaleX: 1.0, scaleY: 1.0, alignment },
            });
          }
        } catch (positionError) {
          console.error('[V2] Failed to lay out labels:', positionError.message || positionError);
        }
      } else {
        console.error('[V2] Label items missing in nested scene; skipping label layout');
      }
    } else {
      // --- HTML label browser source (default; LABEL_RENDERER=html) ---
      // One transparent browser_source replaces the 5-input native chrome; the
      // overlay page renders the whole plate (team + name + branding) from the DB.
      await createStreamLabelBrowserSource(
        { call: obsClient.call.bind(obsClient) },
        { sceneName: streamGroupName, cleanGroupName, cleanStreamName, streamId, lockSources }
      );
    }

    const { sceneItems: teamSceneItems } = await obsClient.call('GetSceneItemList', { sceneName: groupName });
    const nestedSceneInTeam = teamSceneItems.some(item => item.sourceName === streamGroupName);

    if (!nestedSceneInTeam) {
      try {
        const { sceneItemId } = await obsClient.call('CreateSceneItem', {
          sceneName: groupName,
          sourceName: streamGroupName,
          sceneItemEnabled: true,
        });
        await obsClient.call('SetSceneItemTransform', {
          sceneName: groupName,
          sceneItemId,
          sceneItemTransform: {
            alignment: 5,
            boundsAlignment: 0,
            boundsType: 'OBS_BOUNDS_SCALE_INNER',
            boundsWidth: 1600,
            boundsHeight: 900,
            scaleX: 1.0,
            scaleY: 1.0,
          },
        });
      } catch (e) {
        console.error('[V2] Failed to add nested scene to team scene:', e.message);
      }
    }

    return {
      success: true,
      message: `Stream group created as nested scene (V2, ${useFfmpegSource ? 'ffmpeg_source' : 'browser_source'})`,
      streamGroupName,
      sourceName,
      textSourceName,
      useFfmpegSource,
    };
  } catch (error) {
    console.error('[V2] Error creating stream group:', error.message);
    throw error;
  }
}

// Retrofit the current playback policy onto every existing ffmpeg_source input
// (so OBS_RESTART_ON_ACTIVATE / close_when_inactive changes take effect without
// deleting and re-adding streams). Delegates to the unit-tested helper, passing
// the live OBS client's call().
async function applyPlaybackSettingsToInputs() {
  const obsClient = await getOBSClient();
  return applyFfmpegPlaybackSettings({ call: obsClient.call.bind(obsClient) });
}

// Comprehensive stream deletion function
async function deleteStreamComponents(streamName, teamName, groupName) {
  try {
    const obsClient = await getOBSClient();
    
    const cleanGroupName = cleanObsName(groupName);
    const cleanStreamName = cleanObsName(streamName);
    const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
    const sourceName = `${cleanGroupName}_${cleanStreamName}`;
    const textSourceName = cleanObsName(teamName) + '_text';
    const nameTextSourceName = `${cleanGroupName}_${cleanStreamName}_name_text`;

    console.log(`Starting comprehensive deletion for stream "${streamName}"`);
    console.log(`Components to delete: scene="${streamGroupName}", source="${sourceName}"`);

    // 1. Detach this stream's nested scene from ALL source switchers FIRST.
    // ORDER IS LOad-BEARING: the source-switcher plugin actively polls and renders
    // its source list, so removing the scene/input while a switcher still
    // references it leaves the plugin rendering a dangling scene — which CRASHES
    // OBS (confirmed in the crash log: OBS dies exactly on the RemoveScene of a
    // switcher-referenced "_stream" scene, even with the removals paced). Pulling
    // the references up-front makes the scene/input removal below safe.
    const screens = SOURCE_SWITCHER_NAMES;
    for (const screen of screens) {
      try {
        await removeSourceFromSwitcher(screen, streamGroupName);
        console.log(`Removed "${streamGroupName}" from ${screen}`);
      } catch (error) {
        console.log(`Error removing from ${screen}:`, error.message);
      }
    }
    // Let the switcher plugin pick up the trimmed list (it polls) before the
    // scene disappears underneath it.
    await sleep(OBS_BULK_PACE_MS);

    // 2. Remove stream group scene item from team scene (if it exists)
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

    // 3. Remove the nested scene (stream group)
    try {
      await obsClient.call('RemoveScene', { sceneName: streamGroupName });
      console.log(`Removed nested scene "${streamGroupName}"`);
    } catch (error) {
      console.log(`Nested scene "${streamGroupName}" not found:`, error.message);
    }

    // 4. Remove the browser source
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

    // 4b. Remove the per-stream label inputs. Covers BOTH renderers: the HTML
    // path's single `_label` browser source, and the legacy native 5-input
    // chrome (streamer text + background, per-stream team background, accent
    // bar). Unlike the shared team text these are unique to the stream and must
    // be removed explicitly — RemoveScene drops scene items, not the inputs.
    // Removing both sets keeps teardown correct for mixed/old scenes.
    for (const labelInput of [
      streamLabelInputName(cleanGroupName, cleanStreamName),
      nameTextSourceName,
      `${nameTextSourceName}_bg`,
      `${cleanGroupName}_${cleanStreamName}_team_bg`,
      `${cleanGroupName}_${cleanStreamName}_accent`,
    ]) {
      try {
        const { inputs } = await obsClient.call('GetInputList');
        const found = inputs.find(input => input.inputName === labelInput);
        if (found) {
          await obsClient.call('RemoveInput', { inputUuid: found.inputUuid });
          console.log(`Removed per-stream label "${labelInput}"`);
        }
      } catch (error) {
        console.log(`Per-stream label "${labelInput}" not found:`, error.message);
      }
    }

    // 5. Check if text source should be removed (only if no other streams from this team exist)
    try {
      // This would require checking if other streams from the same team exist
      // For now, we'll leave the text source as it's shared across team streams
      console.log(`Keeping shared text source "${textSourceName}" (shared across team streams)`);
    } catch (error) {
      console.log(`Error checking text source usage:`, error.message);
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
    const screens = SCREEN_POSITIONS;
    
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
    const textSourceName = cleanObsName(teamName) + '_text';
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

    // 2b. Remove the legacy shared team-label background plus every per-stream
    // NATIVE label input for this team (streamer text/bg, per-stream team bg,
    // accent). RemoveScene drops scene items but not inputs, and these aren't
    // browser_source kind, so step 4 below never sweeps them. The HTML `_label`
    // browser source is intentionally NOT matched here — it is removed once by
    // the generic browser-source sweep in step 4 (no double-removal).
    try {
      const { inputs } = await obsClient.call('GetInputList');
      const cleanGroupName = cleanObsName(groupName || teamName);
      const labelInputs = inputs.filter(input =>
        isLegacyTeamLabelInputName(input.inputName, cleanGroupName, textSourceName)
      );
      console.log(`Found ${labelInputs.length} label inputs to delete`);
      for (const labelInput of labelInputs) {
        try {
          await obsClient.call('RemoveInput', { inputUuid: labelInput.inputUuid });
          console.log(`Removed label input "${labelInput.inputName}"`);
        } catch (error) {
          console.log(`Error removing label input "${labelInput.inputName}":`, error.message);
        }
        await sleep(OBS_BULK_PACE_MS);
      }
    } catch (error) {
      console.log('Error finding label inputs:', error.message);
    }

    // 3. Get all scenes to check for nested stream scenes
    try {
      const { scenes } = await obsClient.call('GetSceneList');
      const cleanGroupName = cleanObsName(groupName || teamName);
      
      // Find all nested stream scenes for this team
      const streamScenes = scenes.filter(scene => 
        scene.sceneName.startsWith(`${cleanGroupName}_`) && 
        scene.sceneName.endsWith('_stream')
      );
      
      console.log(`Found ${streamScenes.length} stream scenes to delete`);
      
      // Delete each stream scene (paced — see OBS_BULK_PACE_MS)
      for (const streamScene of streamScenes) {
        try {
          await obsClient.call('RemoveScene', { sceneName: streamScene.sceneName });
          console.log(`Removed stream scene "${streamScene.sceneName}"`);
        } catch (error) {
          console.log(`Error removing stream scene "${streamScene.sceneName}":`, error.message);
        }
        await sleep(OBS_BULK_PACE_MS);
      }
    } catch (error) {
      console.log(`Error finding stream scenes:`, error.message);
    }
    
    // 4. Remove any browser sources associated with this team
    try {
      const { inputs } = await obsClient.call('GetInputList');
      const cleanGroupName = cleanObsName(groupName || teamName);
      
      // Find all browser sources for this team
      const teamBrowserSources = inputs.filter(input => 
        input.inputKind === 'browser_source' && 
        input.inputName.startsWith(`${cleanGroupName}_`)
      );
      
      console.log(`Found ${teamBrowserSources.length} browser sources to delete`);
      
      // Delete each browser source (paced — see OBS_BULK_PACE_MS)
      for (const source of teamBrowserSources) {
        try {
          await obsClient.call('RemoveInput', { inputUuid: source.inputUuid });
          console.log(`Removed browser source "${source.inputName}"`);
        } catch (error) {
          console.log(`Error removing browser source "${source.inputName}":`, error.message);
        }
        await sleep(OBS_BULK_PACE_MS);
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
  createStreamGroupV2,
  applyPlaybackSettingsToInputs,
  getAvailableTextInputKind,
  deleteStreamComponents,
  removeSourceFromSwitcher,
  clearTextFilesForStream,
  deleteTeamComponents,
  createStreamLabelBrowserSource,
  streamLabelInputName,
  isLegacyTeamLabelInputName,
  labelRenderer,
  labelShutdownWhenHidden,
  labelOverlayUrl,
};