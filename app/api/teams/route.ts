import { getDatabase } from '../../../lib/database';
import { Team } from '@/types';
import { TABLE_NAMES } from '@/lib/constants';
import { 
  withErrorHandling, 
  createSuccessResponse, 
  createValidationError, 
  createDatabaseError,
  parseRequestBody 
} from '@/lib/apiHelpers';

// Validation for team creation
function validateTeamInput(data: unknown): { 
  valid: boolean; 
  data?: { team_name: string }; 
  errors?: Record<string, string> 
} {
  const errors: Record<string, string> = {};
  
  if (!data || typeof data !== 'object') {
    errors.general = 'Request body must be an object';
    return { valid: false, errors };
  }
  
  const { team_name } = data as { team_name?: unknown };
  
  if (!team_name || typeof team_name !== 'string') {
    errors.team_name = 'Team name is required and must be a string';
  } else if (team_name.trim().length < 2) {
    errors.team_name = 'Team name must be at least 2 characters long';
  } else if (team_name.trim().length > 50) {
    errors.team_name = 'Team name must be less than 50 characters long';
  }
  
  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }
  
  return { 
    valid: true, 
    data: { team_name: (team_name as string).trim() }
  };
}

export const GET = withErrorHandling(async () => {
  try {
    const db = await getDatabase();
    const teams: Team[] = await db.all(`SELECT team_id, team_name, group_name FROM ${TABLE_NAMES.TEAMS} ORDER BY team_name ASC`);
    
    return createSuccessResponse(teams);
  } catch (error) {
    return createDatabaseError('fetch teams', error);
  }
});

export const POST = withErrorHandling(async (request: Request) => {
  const bodyResult = await parseRequestBody(request, validateTeamInput);
  
  if (!bodyResult.success) {
    return bodyResult.response;
  }
  
  const { team_name } = bodyResult.data;
  
  try {
    const db = await getDatabase();
    
    // Check if team name already exists
    const existingTeam = await db.get(
      `SELECT team_id FROM ${TABLE_NAMES.TEAMS} WHERE LOWER(team_name) = LOWER(?)`,
      [team_name]
    );
    
    if (existingTeam) {
      return createValidationError(
        'Team name already exists',
        { team_name: 'A team with this name already exists' }
      );
    }
    
    const result = await db.run(
      `INSERT INTO ${TABLE_NAMES.TEAMS} (team_name) VALUES (?)`,
      [team_name]
    );
    
    const newTeam: Team = {
      team_id: result.lastID!,
      team_name: team_name,
      group_name: null
    };
    
    return createSuccessResponse(newTeam, 201);
  } catch (error) {
    return createDatabaseError('create team', error);
  }
});