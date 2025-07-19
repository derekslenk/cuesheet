import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { FILE_DIRECTORY } from '../../../config';
import { getDatabase } from '../../../lib/database';
import { Stream } from '@/types';
import { validateScreenInput } from '../../../lib/security';

export async function POST(request: NextRequest) {
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

    console.log('Writing files to', path.join(FILE_DIRECTORY(), `${screen}.txt`));
    const filePath = path.join(FILE_DIRECTORY(), `${screen}.txt`);

    try {
      const db = await getDatabase();
      const stream: Stream | undefined = await db.get<Stream>(
        'SELECT * FROM streams_2025_spring_adr WHERE id = ?',
        [id]
      );

      console.log('Stream:', stream);

      if (!stream) {
        return NextResponse.json({ error: 'Stream not found' }, { status: 400 });
      }

      fs.writeFileSync(filePath, stream.obs_source_name);
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
