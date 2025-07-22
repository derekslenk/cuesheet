import { NextRequest } from 'next/server';
import { getDatabase } from '../../../lib/database';
import { TABLE_NAMES } from '../../../lib/constants';
import { createErrorResponse, createSuccessResponse, createDatabaseError, withErrorHandling } from '../../../lib/apiHelpers';

async function getTeamNameHandler(request: NextRequest) {
  // Extract the team_id from the query string
  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get('team_id');

  if (!teamId) {
    return createErrorResponse('Missing team_id', 400, 'team_id parameter is required');
  }

  try {
    const db = await getDatabase();
    const team = await db.get(
      `SELECT team_name FROM ${TABLE_NAMES.TEAMS} WHERE team_id = ?`,
      [teamId]
    );

    if (!team) {
      return createErrorResponse('Team not found', 404, `No team found with ID: ${teamId}`);
    }

    return createSuccessResponse({ team_name: team.team_name });
  } catch (error) {
    return createDatabaseError('fetch team name', error);
  }
}

export const GET = withErrorHandling(getTeamNameHandler);
