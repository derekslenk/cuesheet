import { NextRequest, NextResponse } from 'next/server';
import { getOBSClient } from '../../../lib/obsClient';

// Valid scene names for this application
const VALID_SCENES = ['1-Screen', '2-Screen', '4-Screen'] as const;
type ValidScene = typeof VALID_SCENES[number];

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sceneName } = body;

    // Validate scene name
    if (!sceneName || typeof sceneName !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Scene name is required' },
        { status: 400 }
      );
    }

    if (!VALID_SCENES.includes(sceneName as ValidScene)) {
      return NextResponse.json(
        { 
          success: false, 
          error: 'Invalid scene name', 
          validScenes: VALID_SCENES 
        },
        { status: 400 }
      );
    }

    try {
      const obsClient = await getOBSClient();
      
      // Switch to the requested scene
      await obsClient.call('SetCurrentProgramScene', { sceneName });
      
      console.log(`Successfully switched to scene: ${sceneName}`);
      
      return NextResponse.json({
        success: true,
        data: { sceneName },
        message: `Switched to ${sceneName} layout`
      });
    } catch (obsError) {
      console.error('OBS WebSocket error:', obsError);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Failed to switch scene in OBS',
          details: obsError instanceof Error ? obsError.message : 'Unknown error'
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error switching scene:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Invalid request format' 
      },
      { status: 400 }
    );
  }
}