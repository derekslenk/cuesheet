import { getDatabase } from '../../../lib/database';
import { TABLE_NAMES } from '../../../lib/constants';
import { createSuccessResponse, createDatabaseError, withErrorHandling } from '../../../lib/apiHelpers';

async function getCountsHandler() {
  try {
    const db = await getDatabase();
    
    // Get counts in parallel
    const [streamsResult, teamsResult] = await Promise.all([
      db.get(`SELECT COUNT(*) as count FROM ${TABLE_NAMES.STREAMS}`),
      db.get(`SELECT COUNT(*) as count FROM ${TABLE_NAMES.TEAMS}`)
    ]);

    return createSuccessResponse({
      streams: streamsResult.count,
      teams: teamsResult.count
    });
  } catch (error) {
    return createDatabaseError('fetch counts', error);
  }
}

export const GET = withErrorHandling(getCountsHandler);