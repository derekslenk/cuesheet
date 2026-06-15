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
import { createGroupIfNotExists, createTextSource } from '@/lib/obsClient';

// Validation for team creation
function validateTeamInput(data: unknown): { 
  valid: boolean; 
  data?: { team_name: string; create_obs_group?: boolean }; 
  errors?: Record<string, string> 
} {
  const errors: Record<string, string> = {};
  
  if (!data || typeof data !== 'object') {
    errors.general = 'Request body must be an object';
    return { valid: false, errors };
  }
  
  const { team_name, create_obs_group } = data as { team_name?: unknown; create_obs_group?: unknown };
  
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
    data: { 
      team_name: (team_name as string).trim(),
      create_obs_group: create_obs_group === true
    }
  };
}

export const GET = withErrorHandling(async () => {
  try {
    const db = await getDatabase();
    // SELECT * so the per-team branding columns (color_*/logo_path) are included
    // when present, but the query still works on a DB that predates the branding
    // migration (the columns are simply absent from the row).
    const teams: Team[] = await db.all(`SELECT * FROM ${TABLE_NAMES.TEAMS} ORDER BY team_name ASC`);

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
  
  const { team_name, create_obs_group } = bodyResult.data;
  
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
    
    let groupName: string | null = null;
    let groupUuid: string | null = null;
    
    // Create OBS group and text source if requested
    if (create_obs_group) {
      try {
        const obsResult = await createGroupIfNotExists(team_name);
        groupName = team_name;
        groupUuid = obsResult.sceneUuid;
        
        // Create text source for the team
        const textSourceName = team_name.toLowerCase().replace(/\s+/g, '_') + '_text';
        await createTextSource(team_name, textSourceName, team_name);
        
        console.log(`OBS group and text source created for team "${team_name}"`);
      } catch (obsError) {
        console.error('Error creating OBS group:', obsError);
        // Continue with team creation even if OBS fails
      }
    }
    
    const result = await db.run(
      `INSERT INTO ${TABLE_NAMES.TEAMS} (team_name, group_name, group_uuid) VALUES (?, ?, ?)`,
      [team_name, groupName, groupUuid]
    );
    
    const newTeam: Team = {
      team_id: result.lastID!,
      team_name: team_name,
      group_name: groupName,
      group_uuid: groupUuid
    };
    
    return createSuccessResponse(newTeam, 201);
  } catch (error) {
    return createDatabaseError('create team', error);
  }
});