import { NextResponse } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { Stream } from '@/types';
import { TABLE_NAMES } from '../../../lib/constants';
import { createSuccessResponse, createDatabaseError, withErrorHandling } from '../../../lib/apiHelpers';

async function getStreamsHandler() {
  try {
    const db = await getDatabase();
    const streams: Stream[] = await db.all(`SELECT * FROM ${TABLE_NAMES.STREAMS}`);
    return createSuccessResponse(streams);
  } catch (error) {
    return createDatabaseError('fetch streams', error);
  }
}

export const GET = withErrorHandling(getStreamsHandler);
