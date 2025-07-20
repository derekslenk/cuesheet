import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/database';
import { TABLE_NAMES } from '../../../../lib/constants';
import { getOBSClient } from '../../../../lib/obsClient';

interface OBSInput {
  inputName: string;
  inputUuid: string;
}

interface GetInputListResponse {
  inputs: OBSInput[];
}

// GET single stream
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = await getDatabase();
    const stream = await db.get(
      `SELECT * FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [resolvedParams.id]
    );
    
    if (!stream) {
      return NextResponse.json(
        { error: 'Stream not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(stream);
  } catch (error) {
    console.error('Error fetching stream:', error);
    return NextResponse.json(
      { error: 'Failed to fetch stream' },
      { status: 500 }
    );
  }
}

// PUT update stream
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const { name, obs_source_name, url, team_id } = await request.json();
    
    if (!name || !obs_source_name || !url) {
      return NextResponse.json(
        { error: 'Name, OBS source name, and URL are required' },
        { status: 400 }
      );
    }

    const db = await getDatabase();
    
    // Check if stream exists
    const existingStream = await db.get(
      `SELECT * FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [resolvedParams.id]
    );
    
    if (!existingStream) {
      return NextResponse.json(
        { error: 'Stream not found' },
        { status: 404 }
      );
    }
    
    // Update stream
    await db.run(
      `UPDATE ${TABLE_NAMES.STREAMS} 
       SET name = ?, obs_source_name = ?, url = ?, team_id = ?
       WHERE id = ?`,
      [name, obs_source_name, url, team_id, resolvedParams.id]
    );
    
    return NextResponse.json({ 
      message: 'Stream updated successfully',
      id: resolvedParams.id 
    });
  } catch (error) {
    console.error('Error updating stream:', error);
    return NextResponse.json(
      { error: 'Failed to update stream' },
      { status: 500 }
    );
  }
}

// DELETE stream
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolvedParams = await params;
    const db = await getDatabase();
    
    // Check if stream exists
    const existingStream = await db.get(
      `SELECT * FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [resolvedParams.id]
    );
    
    if (!existingStream) {
      return NextResponse.json(
        { error: 'Stream not found' },
        { status: 404 }
      );
    }
    
    // Try to delete from OBS first
    try {
      const obs = await getOBSClient();
      console.log('OBS client obtained:', !!obs);
      
      if (obs && existingStream.obs_source_name) {
        console.log(`Attempting to remove OBS source: ${existingStream.obs_source_name}`);
        
        // Get the input UUID first
        const response = await obs.call('GetInputList');
        const inputs = response as GetInputListResponse;
        console.log(`Found ${inputs.inputs.length} inputs in OBS`);
        
        const input = inputs.inputs.find((i: OBSInput) => i.inputName === existingStream.obs_source_name);
        
        if (input) {
          console.log(`Found input with UUID: ${input.inputUuid}`);
          await obs.call('RemoveInput', { inputUuid: input.inputUuid });
          console.log(`Successfully removed OBS source: ${existingStream.obs_source_name}`);
        } else {
          console.log(`Input not found in OBS: ${existingStream.obs_source_name}`);
          console.log('Available inputs:', inputs.inputs.map((i: OBSInput) => i.inputName));
        }
      } else {
        console.log('OBS client not available or no source name provided');
      }
    } catch (obsError) {
      console.error('Error removing source from OBS:', obsError);
      // Continue with database deletion even if OBS removal fails
    }
    
    // Delete stream from database
    await db.run(
      `DELETE FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [resolvedParams.id]
    );
    
    return NextResponse.json({ 
      message: 'Stream deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting stream:', error);
    return NextResponse.json(
      { error: 'Failed to delete stream' },
      { status: 500 }
    );
  }
}