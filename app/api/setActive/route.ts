import { NextRequest, NextResponse } from 'next/server';
import path from 'path';
import { FILE_DIRECTORY } from '../../../config';
import { getDatabase } from '../../../lib/database';
import { StreamWithTeam } from '@/types';
import { validateScreenInput } from '../../../lib/security';
import { TABLE_NAMES } from '../../../lib/constants';
import { atomicWriteFileSync } from '../../../lib/atomicWrite';

export async function POST(request: NextRequest) {
  const start = Date.now();
  // Parse and validate request body
  try {
    const body = await request.json();
    const validation = validateScreenInput(body);

    if (!validation.valid) {
      return NextResponse.json({ 
        error: 'Validation failed', 
        details: validation.errors 
      }, { status: 400 });
    }

    const { screen, id } = validation.data!;

    const baseDir = path.resolve(FILE_DIRECTORY());
    const candidatePath = path.resolve(baseDir, `${screen}.txt`);
    if (candidatePath !== baseDir && !candidatePath.startsWith(baseDir + path.sep)) {
      return NextResponse.json({ error: 'Invalid screen path' }, { status: 400 });
    }
    console.log('Writing files to', candidatePath);
    const filePath = candidatePath;

    try {
      const db = await getDatabase();
      const stream: StreamWithTeam | undefined = await db.get<StreamWithTeam>(
        `SELECT s.*, t.team_name, t.group_name 
         FROM ${TABLE_NAMES.STREAMS} s 
         LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id 
         WHERE s.id = ?`,
        [id]
      );

      console.log('Stream:', stream);

      if (!stream) {
        return NextResponse.json({ error: 'Stream not found' }, { status: 400 });
      }

      // Construct proper stream group name with team prefix
      const groupName = stream.group_name || stream.team_name;
      const cleanGroupName = groupName.toLowerCase().replace(/\s+/g, '_');
      const cleanStreamName = stream.name.toLowerCase().replace(/\s+/g, '_');
      const streamGroupName = `${cleanGroupName}_${cleanStreamName}_stream`;
      atomicWriteFileSync(filePath, streamGroupName);
      const ms = Date.now() - start;
      console.log(JSON.stringify({ ts: new Date().toISOString(), screen, group: streamGroupName, ms }));
      return NextResponse.json({ message: `${screen} updated successfully.` }, { status: 200 });
    } catch (error) {
      console.error('Error updating active source:', error);
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      return NextResponse.json(
        { error: 'Failed to update active source', details: errorMessage },
        { status: 500 }
      );
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
  }
}
