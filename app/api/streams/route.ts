import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { StreamWithTeam } from '@/types';
import { TABLE_NAMES } from '../../../lib/constants';
import { createSuccessResponse, createDatabaseError, withErrorHandling } from '../../../lib/apiHelpers';

async function getStreamsHandler() {
  try {
    const db = await getDatabase();
    const streams: StreamWithTeam[] = await db.all(`
      SELECT 
        s.*, 
        t.team_name, 
        t.group_name
      FROM ${TABLE_NAMES.STREAMS} s
      LEFT JOIN ${TABLE_NAMES.TEAMS} t ON s.team_id = t.team_id
    `);
    return createSuccessResponse(streams);
  } catch (error) {
    return createDatabaseError('fetch streams', error);
  }
}

export const GET = withErrorHandling(getStreamsHandler);
