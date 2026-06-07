import { NextRequest, NextResponse } from 'next/server';
import { getDatabase } from '../../../../lib/database';
import { TABLE_NAMES } from '../../../../lib/constants';
import { deleteStreamComponents, clearTextFilesForStream } from '../../../../lib/obsClient';
import { stopPreview } from '../../../../lib/previewManager';

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
    
    // Check if stream exists and get team info
    const existingStream = await db.get(
      `SELECT s.*, t.team_name, t.group_name 
       FROM ${TABLE_NAMES.STREAMS} s 
       LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id 
       WHERE s.id = ?`,
      [resolvedParams.id]
    );
    
    if (!existingStream) {
      return NextResponse.json(
        { error: 'Stream not found' },
        { status: 404 }
      );
    }
    
    // Try comprehensive OBS cleanup first
    let obsCleanupResults = null;
    try {
      if (existingStream.name && existingStream.team_name) {
        const groupName = existingStream.group_name || existingStream.team_name;
        
        console.log(`Starting comprehensive OBS cleanup for stream: ${existingStream.name}`);
        console.log(`Team: ${existingStream.team_name}, Group: ${groupName}`);
        
        // Perform comprehensive OBS deletion
        obsCleanupResults = await deleteStreamComponents(
          existingStream.name, 
          existingStream.team_name, 
          groupName
        );
        
        console.log('OBS cleanup results:', obsCleanupResults);
        
        // Clear text files that reference this stream
        const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
        const cleanStreamName = existingStream.name.toLowerCase().replace(/\s+/g, '_');
        const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
        
        const textFileResults = await clearTextFilesForStream(streamGroupName);
        console.log('Text file cleanup results:', textFileResults);
        
      } else {
        console.log('Missing stream or team information for comprehensive cleanup');
      }
    } catch (obsError) {
      console.error('Error during comprehensive OBS cleanup:', obsError);
      // Continue with database deletion even if OBS cleanup fails
    }
    
    // Stop any in-flight preview packager for this stream (best-effort) so its
    // ffmpeg + UDP socket + temp dir don't outlive the stream it previews.
    const numericId = Number(resolvedParams.id);
    if (Number.isInteger(numericId)) stopPreview(numericId);

    // Delete stream from database
    await db.run(
      `DELETE FROM ${TABLE_NAMES.STREAMS} WHERE id = ?`,
      [resolvedParams.id]
    );
    
    return NextResponse.json({ 
      message: 'Stream deleted successfully',
      cleanup: obsCleanupResults || 'OBS cleanup was not performed'
    });
  } catch (error) {
    console.error('Error deleting stream:', error);
    return NextResponse.json(
      { error: 'Failed to delete stream' },
      { status: 500 }
    );
  }
}