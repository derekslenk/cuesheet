import { NextResponse } from 'next/server';
import { getOBSClient } from '../../../lib/obsClient';

export async function GET() {
  try {
    const obsClient = await getOBSClient();
    
    // Get the current program scene
    const response = await obsClient.call('GetCurrentProgramScene');
    const { currentProgramSceneName } = response;
    
    console.log(`Current OBS scene: ${currentProgramSceneName}`);
    
    return NextResponse.json({
      success: true,
      data: { sceneName: currentProgramSceneName },
      message: 'Current scene retrieved successfully'
    });
  } catch (obsError) {
    console.error('OBS WebSocket error:', obsError);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get current scene from OBS',
        details: obsError instanceof Error ? obsError.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}