import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const OBS_HOST = process.env.OBS_WEBSOCKET_HOST || '127.0.0.1';
    const OBS_PORT = process.env.OBS_WEBSOCKET_PORT || '4455';
    const OBS_PASSWORD = process.env.OBS_WEBSOCKET_PASSWORD || '';
    
    // Use the persistent connection from obsClient
    const { getOBSClient, getConnectionStatus } = require('@/lib/obsClient');
    
    const connectionStatus: {
      host: string;
      port: string;
      hasPassword: boolean;
      connected: boolean;
      version?: {
        obsVersion: string;
        obsWebSocketVersion: string;
      };
      currentScene?: string;
      currentPreviewScene?: string;
      sceneCount?: number;
      streaming?: boolean;
      recording?: boolean;
      studioModeEnabled?: boolean;
      error?: string;
    } = {
      host: OBS_HOST,
      port: OBS_PORT,
      hasPassword: !!OBS_PASSWORD,
      connected: false
    };

    try {
      // Check current connection status first
      const currentStatus = getConnectionStatus();
      
      let obs;
      if (currentStatus.connected) {
        // Use existing connection
        obs = currentStatus.client;
      } else {
        // Try to establish connection
        obs = await getOBSClient();
      }

      // Get version info
      const versionInfo = await obs.call('GetVersion');
      
      // Get current scene info
      const currentSceneInfo = await obs.call('GetCurrentProgramScene');
      
      // Get scene list
      const sceneList = await obs.call('GetSceneList');
      
      // Get streaming status
      const streamStatus = await obs.call('GetStreamStatus');
      
      // Get recording status
      const recordStatus = await obs.call('GetRecordStatus');
      
      // Get studio mode status
      const studioModeStatus = await obs.call('GetStudioModeEnabled');
      
      // Get preview scene if studio mode is enabled
      let currentPreviewScene;
      if (studioModeStatus.studioModeEnabled) {
        try {
          const previewSceneInfo = await obs.call('GetCurrentPreviewScene');
          currentPreviewScene = previewSceneInfo.sceneName;
        } catch (previewError) {
          console.log('Could not get preview scene:', previewError);
        }
      }
      
      connectionStatus.connected = true;
      connectionStatus.version = {
        obsVersion: versionInfo.obsVersion,
        obsWebSocketVersion: versionInfo.obsWebSocketVersion
      };
      connectionStatus.currentScene = currentSceneInfo.sceneName;
      connectionStatus.currentPreviewScene = currentPreviewScene;
      connectionStatus.sceneCount = sceneList.scenes.length;
      connectionStatus.streaming = streamStatus.outputActive;
      connectionStatus.recording = recordStatus.outputActive;
      connectionStatus.studioModeEnabled = studioModeStatus.studioModeEnabled;
      
    } catch (err) {
      connectionStatus.error = err instanceof Error ? err.message : 'Unknown error occurred';
    }

    return NextResponse.json(connectionStatus);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to check OBS status', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}