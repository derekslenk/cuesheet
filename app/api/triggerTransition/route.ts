import { NextResponse } from 'next/server';
import { getOBSClient } from '../../../lib/obsClient';
import type { ObsClient } from '@/types/obsClient';

export async function POST() {
  try {
    const obsClient: ObsClient = await getOBSClient();
    
    // Check if studio mode is active
    const { studioModeEnabled } = await obsClient.call('GetStudioModeEnabled');
    
    if (!studioModeEnabled) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Studio mode is not enabled',
          message: 'Studio mode must be enabled to trigger transitions'
        },
        { status: 400 }
      );
    }

    try {
      // Trigger the studio mode transition (preview to program)
      await obsClient.call('TriggerStudioModeTransition');
      console.log('Successfully triggered studio mode transition');
      
      // Get the updated scene information after transition
      const [programResponse, previewResponse] = await Promise.all([
        obsClient.call('GetCurrentProgramScene'),
        obsClient.call('GetCurrentPreviewScene')
      ]);
      
      return NextResponse.json({
        success: true,
        data: { 
          programScene: programResponse.currentProgramSceneName,
          previewScene: previewResponse.currentPreviewSceneName 
        },
        message: 'Successfully transitioned preview to program'
      });
    } catch (obsError) {
      console.error('OBS WebSocket error during transition:', obsError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to trigger transition in OBS',
          details: obsError instanceof Error ? obsError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error triggering transition:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to connect to OBS or trigger transition' 
      },
      { status: 500 }
    );
  }
}